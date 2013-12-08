'use strict';

var express = require('express');
var http = require('http');
var path = require('path');
var os = require('os');
var fs = require('fs');
var Q = require('q');
var MIME = require('mime');
var child_process = require('child_process');
var faye = require('faye');
var moment = require('moment');
var uuid = require('node-uuid');
var formidable = require('formidable');
var app = express();

var fayeBase = "/fayewebsocket",
	bayeux = new faye.NodeAdapter({
	mount: fayeBase
});

app.configure(function() {
	app.use(express.compress());
	app.use(function(req, res, next) {
		if(req.url.match(/\.(js|css)/)) {
			res.set("Cache-Control", "max-age=0, no-store, no-cache, must-revalidate");
		}
		return next();
	});
	app.use('/js', express.static(path.join(__dirname, 'js')));
	app.use('/css', express.static(path.join(__dirname, 'css')));
	app.use('/images', express.static(path.join(__dirname, 'images')));
});

// all environments
app.set('port', process.env.PORT || 3000);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

var fayeClient,
	folderWatchers = {};

function makeStatObject(filename, stat) {
	var o = {};
	o.name = filename;
	o.size = stat.size;
	o.ctime = stat.ctime;
	o.atime = stat.atime;
	o.mtime = stat.mtime;
	o.type = stat.isFile() ? 'f' : 'd';
	return o;
}

var excludeFiles = {
	'.DS_Store': null,
	'.Trash': null,
	'.Trashes': null,
	'.localized': null,
	'.DocumentRevisions-V100': null,
	'.Spotlight-V100': null,
	'.TemporaryItems': null,
	'Thumbs.db': null
};

var mime = (function() {

	var self = {},
		customs = {
		'.dpx': 'image/dpx',
		'.cin': 'image/x-cin',
		'.exr': 'image/x-exr',
		'.pic': 'image/x-pic',
		'.m2ts': 'video/mpeg',
		'.mts': 'video/mpeg',
		'.k25': 'image/k25',
		'.sgi': 'image/sgi',
		'.jpx': 'image/jpx',
		'.dng': 'image/dng',
		'.3fr': 'image/3fr',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.tif': 'image/tiff',
		'.tiff': 'image/tiff',
		'.crw': 'image/crw',
		'.raf': 'image/raf',
		'.pix': 'image/pix',
		'.hdr': 'image/hdr',
		'.kdc': 'image/kdc',
		'.svg': 'image/svg',
		'.dcx': 'image/dcx',
		'.bmp': 'image/bmp',
		'.dcm': 'image/dcm',
		'.dcr': 'image/dcr',
		'.cur': 'image/cur',
		'.erf': 'image/erf',
		'.png': 'image/png',
		'.nrw': 'image/nrw',
		'.arw': 'image/arw',
		'.ai': 'image/ai',
		'.cr2': 'image/cr2',
		'.gif': 'image/gif',
		'.tga': 'image/tga',
		'.ico': 'image/ico',
		'.psd': 'image/psd',
		'.nef': 'image/nef',
		'.epdf': 'application/epdf',
		'.pdf': 'application/pdf'
	};

	self.lookup = function(filepath) {
		var extension = path.extname(filepath).toLowerCase();
		return customs.hasOwnProperty(extension) ? customs[extension] : MIME.lookup(filepath);
	};

	return self;

})();

app.get(/@openbitch\/(.+)/, function(req, res) {
	var fsPath = "/" + req.params[0];
	if (fs.existsSync(fsPath)) {
		res.sendfile(fsPath);
	} else {
		res.status(404);
		res.end();
	}
});

app.get(/@streambitch\/(.+)/, function(req, res) {
	var fsPath = "/" + req.params[0];
	if (fs.existsSync(fsPath)) {
		var size = fs.statSync(fsPath).size,
			mimetype = mime.lookup(fsPath),
			stream = fs.createReadStream(fsPath);
		res.set('Content-Type', mimetype);
		res.set('Content-Length', size);
		stream.on("data", function(chunk) {
			res.write(chunk);
		});
		stream.on('close', function() {
			res.end();
		});
	} else {
		res.status(404);
		res.end();
	}
});

var ffmpegBin = __dirname + "/bin/" + os.platform() + "_ffmpeg";

app.get(/@inspectbitch\/(.+)/, function(req, res) {
	var fsPath = "/" + req.params[0],
		mimetype = mime.lookup(fsPath),
		extension = path.extname(fsPath).toLowerCase();

	res.set('Content-Type', 'text/plain');

	function useffmpeg() {
		var cmd = ffmpegBin + ' -i "BOO" 2>&1'.replace(/BOO/, fsPath);
		child_process.exec(cmd, function(err, stdout) {
			var output = stdout.split("\n").filter(function(line) {
				return line.match(/(stream #|duration)/i);
			});
			if (output.length>0) {
				res.send(output.join("\n"));
			} else {
				res.status(500);
				res.end();
			}
		});
	}

	var plainText = {
		'.sh' : true,
		'.txt' : true,
		'.py' : true,
		'.rb' : true,
		'.js' : true,
		'.css' : true,
		'.json' : true,
		'.htm' : true,
		'.html' : true,
		'.xml' : true
	};

	if (fs.existsSync(fsPath)) {
		if (plainText.hasOwnProperty(extension)) {
			res.sendfile(fsPath);
		} else if (mimetype.match(/image/)) {
			var cmd;
			if (mimetype.match(/(x-exr|x-pic)/)) {
				cmd = "iinfo";
			} else {
				cmd = "identify -verbose";
			}
			child_process.exec(cmd + ' "ME"'.replace(/ME/,fsPath) , function(err, stdout, stderr) {
				if (!stdout.match(new RegExp(fsPath)) ||
					stdout.match(/(unable|failed)/)) {
					useffmpeg();
				} else {
					res.send(stdout);
				}
			});
		} else if (mimetype.match(/video/)) {
			useffmpeg();
		} else {
			res.status(204); // No content
			res.end();
		}
	} else {
		res.status(404);
		res.end();
	}

});

app.get(/@ffmpeg\/(.+)/, function(req, res) {
	var fsPath = "/" + req.params[0],
		mimetype = mime.lookup(fsPath),
		extension = path.extname(fsPath).toLowerCase(),
		args, cmd,
		magick = {
			'.psd': true,
			'.dng': true
		},
		exiv2 = {
			'.raf': true,
			'.crw': true,
			'.cr2': true,
			'.arw': true,
			'.nef': true,
			'.srf': true,
			'.sr2': true,
			'.mrw': true,
			'.raw': true,
			'.rw2': true,
			'.rwl': true
		};

	function sendImage(bin, args) {
		var ffmpegStream = child_process.spawn(bin, args);
		res.set('Content-Type', 'image/jpeg');
		ffmpegStream.stdout.pipe(res);
		ffmpegStream.on("close", function() {
			res.end();
		});
	}

	function sendNoContent() {
		res.sendfile(__dirname + "/images/no-preview.jpg");
	}

	function magicksend(path, useZero, options) {
		var fff = "/tmp/" + uuid.v4()+".jpg",
			p = useZero ? path+'[0]' : path,
			magickBaseCmd = 'convert #OPTIONS "#FILE" -resize 640x400 #DEST';
		if (typeof(options)==='undefined') {
			magickBaseCmd = magickBaseCmd.replace(/#OPTIONS/, "");
		} else {
			magickBaseCmd = magickBaseCmd.replace(/#OPTIONS/, options);
		}
		magickBaseCmd = magickBaseCmd.replace(/#FILE/, p);
		magickBaseCmd = magickBaseCmd.replace(/#DEST/, fff);
		child_process.exec(magickBaseCmd, function(err, stdout, stder) {
			if (fs.existsSync(fff)) {
				setTimeout(function() { fs.unlink(fff); }, 10000);
				res.sendfile(fff);
			} else {
				sendNoContent();
			}
		});
	}

	function ffmpegMakeThumbnailFromImage(path) {
		args = ['-i', fsPath, '-f', 'mjpeg', '-vf', "scale=640:-1", "-"];
		sendImage(ffmpegBin, args);
	}

	if (fs.existsSync(fsPath)) {
		if (exiv2.hasOwnProperty(extension)) {
			var _basename = uuid.v4().replace(/-/g,""),
				tmpFile = '/tmp/' + _basename + extension,
				previewPathToExpect = "/tmp/" + _basename + "-preview2.jpg";
			cmd = 'cp "#FILE" "#TMP" && exiv2 -ep2 "#TMP"'.replace(/#FILE/, fsPath).replace(/#TMP/g, tmpFile);
			child_process.exec(cmd, function(err, stdout, stderr) {
				if (!err && fs.existsSync(previewPathToExpect)) {
					fs.unlink(tmpFile);
					setTimeout(function() {
						fs.unlink(previewPathToExpect, function(err) {
							if (err) { console.log(err); }
						});
					}, 10000);
					res.sendfile(previewPathToExpect);
				} else {
					sendNoContent();
				}
			});
		} else if (mimetype.match(/image/)) {
			if (magick.hasOwnProperty(extension)) {
				if (extension==='.psd') {
					magicksend(fsPath, true, "-flatten")
				} else {
					magicksend(fsPath, false);
				}
			} else {
				ffmpegMakeThumbnailFromImage(fsPath);
			}
		} else if (mimetype.match(/video/)) {
			cmd = ffmpegBin + ' -i "BOO" 2>&1 | grep Duration'.replace(/BOO/, fsPath);
			child_process.exec(cmd, function(err, stdout, stder) {
				var m = stdout.match(/\d\d:\d\d:\d\d/);
				if (m) {
					var duration = m[0].split(":").reduce(function(T,v,i) { return T + (v*Math.pow(60,2-i)); },0),
						offset_in_seconds = parseInt(Math.floor(duration/2));
					args = ['-ss', offset_in_seconds, '-i', fsPath, '-f', 'mjpeg', '-vframes','1','-vf', 'scale=640:-1',"-"];
					sendImage(ffmpegBin, args);
				} else {
					sendNoContent();
				}
			});
		} else if (mimetype.match(/pdf/)) {
			magicksend(fsPath, true)
		} else {
			sendNoContent();
		}
	} else {
		res.status(404);
		res.end();
	}
});


app.get(/@spreadbitch\/?(.*)/, function(req, res) {
	var fsPath = "/" + req.params[0];
	fs.readdir(fsPath, function(err, files) {
		var fileList = [];
		if (!err && files.length>0) {
			Q.all(files.map(function(filename) {
				var q = Q.defer(),
					fullpath = fsPath + "/" + filename;
				fs.stat(fullpath, function(err, stat) {
					if (err) {
						q.resolve(null);
					} else {
						q.resolve(makeStatObject(filename, stat));
					}
				});
				return q.promise;
			})).then(function(results) {
				results.forEach(function(f) {
					if (f!==null) {
						fileList.push(f);
					}
				});
				res.send({
					total: fileList.length,
					listing: fileList
				});
			});
		} else {
			res.send({
				total: 0,
				listing: []
			});
		}
	});
});

app.get(/@abandonbitch\/?(.*)/, function(req, res) {
	var fsPath = "/" + req.params[0];
	if (folderWatchers.hasOwnProperty(fsPath)) {
		folderWatchers[fsPath].listeners-=1;
		if (folderWatchers[fsPath].listeners===0) {
			folderWatchers[fsPath].emitter.close();
			delete folderWatchers[fsPath];
		}
	}
	res.send("OK");
});

app.get(/@watchbitch\/?(.*)/, function(req, res) {
	var fsPath = "/" + req.params[0];
	if (fs.existsSync(fsPath)) {
		if (folderWatchers.hasOwnProperty(fsPath)) {
			folderWatchers[fsPath].listeners+=1;
		} else {
			var watcher = {
				channel: uuid.v4(),
				listeners: 1
			};
			watcher.emitter = fs.watch(fsPath, function(event, filename) {
				var filepath = fsPath + "/" + filename;
				if (excludeFiles.hasOwnProperty(filename)) { return; }
				fs.stat(filepath, function(err, stat) {
					var file;
					if (err) {
						// When stat-ing a file that's gone, we get this err
						// which means, it was most likely deleted
						file = {
							name: filename
						};
						event = 'deleted';
					} else {
						file = makeStatObject(filename, stat);
						var elapsed_since_ctime = moment(file.ctime).fromNow();
						if (event==='rename' && elapsed_since_ctime.match(/seconds/)) {
							/* In moment.js...
							 var t = moment();
							 t.fromNow() #=> 'a few seconds ago'
							 If you wait for a minute:
							 t.fromNow() #=> 'a few minutes ago'
							 */
							event = 'created';
						}
					}
					/* Note, we can actually publish each event to its own channel e.g.
							'/listenbitch/' + watcher.channel + "/created"
							'/listenbitch/' + watcher.channel + "/deleted"
							etc.
					*/
					fayeClient.publish(fayeBase + '/listenbitch/' + watcher.channel, {
						id: uuid.v4(),
						event: event,
						stat: file
					});
				});
			});
			folderWatchers[fsPath] = watcher;
		}
		res.send(folderWatchers[fsPath].channel);
	} else {
		res.status(404);
		res.end();
	}
});

var util = require('util');

app.post('/@dropitlikeitshot', function (req, res) {
	var savePath = req.headers.key,
		form = new formidable.IncomingForm(),
		okToGo = Q.defer();

	if (fs.existsSync(savePath)) {
		fs.unlink(savePath, function(err) {
			if (err) {
				res.status(403);
				res.end();
			} else {
				receiveUpload();
			}
		});
	} else {
		receiveUpload();
	}

	function receiveUpload() {
		var out = fs.createWriteStream(savePath);
		out.on('error', function() {
			res.status(403);
			res.end();
		});
		out.on('open', function() {
			form.onPart = function(part) {
				if (!part.filename) {
					// let formidable handle all non-file parts
					form.handlePart(part);
				}
				part.on("data", function(chunk) {
					out.write(chunk);
				});
			};
			form.parse(req, function(err, fields, files) {
				if (!err) {
					res.status(200);
				} else {
					res.status(500);
				}
				res.end();
			});
		});
	}

});

app.all("*", function(req, res) {
	res.set("Cache-Control", "max-age=0, no-store, no-cache, must-revalidate");
	res.sendfile(__dirname + '/index.html');
});

var server = http.createServer(app);

bayeux.attach(server);

fayeClient = new faye.Client('http://localhost:' + app.get("port") + fayeBase);

server.listen(app.get('port'), function() {
	console.log("Express server listening on port " + app.get('port'));
});