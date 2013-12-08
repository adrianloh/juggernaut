'use strict';

var fayeBase = "/fayewebsocket",
	fayeClient = new Faye.Client(window.location.origin + fayeBase);

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

var Ranger = angular.module('Ranger', ['pasvaz.bindonce']);

Ranger.config(function ($anchorScrollProvider, $locationProvider) {
	$locationProvider.html5Mode(true);
//	$anchorScrollProvider.disableAutoScrolling();
});

Dropzone.autoDiscover = false;

Ranger.filter('toArray', function () {
	return function (obj) {
		if (!(obj instanceof Object)) {
			return obj;
		}
		return Object.keys(obj).map(function (key) {
			return Object.defineProperty(obj[key], '$key', {__proto__: null, value: key});
		});
	}
});


Ranger.directive('dropzone', function($location) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var uploadZoneEl = $(element),
				dropzone,
				options = {
					maxFilesize: 10000,
					parallelUploads: 2,
					addRemoveLinks: true,
					dictCancelUpload: "Cancel",
					url: "/@dropitlikeitshot"
				};

			dropzone = new Dropzone("#"+uploadZoneEl.attr("id"), options);

			dropzone.on("dragover", function() {
				uploadZoneEl.addClass("dropActive");
			});

			dropzone.on("dragleave", function() {
				uploadZoneEl.removeClass("dropActive");
			});

			dropzone.on("drop", function() {
				uploadZoneEl.removeClass("dropActive");
			});

			dropzone.on("addedfile", function(file) {
				file.uploadPath = $location.path() + "/" + file.name;
				uploadZoneEl.removeClass("dropActive");
			});

			dropzone.on("processing", function(file) {
				var filetypes = ['zip','mkv','rar', 'pdf', 'mov', 'mp4', 'flv'],
					el = $(file.previewElement),
					ext = file.name.split(".").slice(-1);
				if (ext.length>0 && filetypes.indexOf(ext[0])>=0) {
					ext = ext[0];
					el.find("img").attr("src","/images/@.png".replace("@",ext)).addClass("imgPreview");
				}
			});

			dropzone.on("sending", function(file, xhr, formData) {
				xhr.setRequestHeader('key', file.uploadPath);
			});

			dropzone.on("uploadprogress", function(file, percentDone, bytesSent) {
				var el = $(file.previewElement).find(".dz-size"), total, uploaded, suffix, statString;
				if (false && bytesSent>=1000000000) {
					total = file.size / 100000000;
					uploaded = bytesSent / 100000000;
					suffix = "GB"
				} else {
					total = file.size / 100000;
					uploaded = bytesSent / 100000;
					suffix = "MB"
				}
				total = ((Math.round(total) / 10)).toString();
				uploaded = ((Math.round(uploaded) / 10)).toString();
				statString = '<strong>###/@@@$$$</strong>'.replace("###",uploaded).replace("@@@",total).replace("$$$",suffix);
				$(el).html(statString);
			});

			dropzone.on("success", function(file, xhr) {
				dropzone.removeFile(file);
			});

			function guid() {
				function S4() {
					return Math.floor(Math.random() * 0x10000).toString(16);
				}
				return (
					S4() + S4() + "-" +
						S4() + "-" +
						S4() + "-" +
						S4() + "-" +
						S4() + S4() + S4()
					);
			}

		}
	};
});


Ranger.directive('previewbox', function () {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var el = $(element);
			scope.previewThumb = "";
			scope.showInfo = function() {
				if (el.position().top<0 || el.position().left>($(window).width()*0.8)) {
					el.attr("style","");
				}
				el.show();
			};
			el.draggable();
			el.dblclick(function() {
				el.hide();
			});
		}
	};
});

var yowza;

Ranger.controller("FilelistController", function($window, $rootScope, $scope, $timeout, $location, $http) {

	$scope.filelist = {};
	$scope.origin = window.location.origin;

	$scope.fileinfo = "";

	$scope.sort = {
		showDropzone: false,
		predicate: 'name',
		reverse: false
	};

	$scope.filterFileItem = function(file) {
		// Return true to show, false to hide
		if (isViewingSequence()) {
			var seq = $location.path().split("/__seq/")[1];
			if (file.hasOwnProperty('isPartOfSequence') &&
				file.isPartOfSequence===seq) {
				return true;
			} else {
				return false;
			}
		} else if (file.hasOwnProperty('isPartOfSequence')) {
			return false;
		}
		return true;
	};

	$scope.openFolder = openFolder;

	$scope.goUpOneLevelOnClick = function() {
		var p = $location.path(),
			n = isViewingSequence() ? -2 : -1;
		openFolder(p.split("/").slice(0,n).join("/"));
	};

	$scope.goBackOnClick = function() {
		history.back();
	};

	$scope.inspectFile = function(file) {
		var url = isViewingSequence() ? $location.path().split("/__seq/")[0] : $location.path(),
			filepath = url + "/" + file.name;
		$scope.previewThumb = "/@ffmpeg" + filepath;
		$scope.showInfo();
		$http({
			method: "GET",
			url: "/@inspectbitch" + filepath
		}).then(function(resObj) {
			if (resObj.status===200) {
				$scope.fileinfo = resObj.data;
			} else {
				$scope.fileinfo = filepath;
			}
		});
	};

	function isViewingSequence() {
		return $location.path().match(/__seq/)!==null;
	}

	function filesize(size) {
		var string;
		if (size >= 100000000000) {
			size = size / 100000000000;
			string = "TB";
		} else if (size >= 100000000) {
			size = size / 100000000;
			string = "GB";
		} else if (size >= 100000) {
			size = size / 100000;
			string = "MB";
		} else if (size >= 100) {
			size = size / 100;
			string = "KB";
		} else {
			size = size * 10;
			string = "b";
		}
		return (Math.round(size) / 10).toString() + string;
	}

	function getFrameRanges(frames) {
		var mSeq = [],
			seq;
		frames.sort(function(a, b) { return a - b; }).forEach(function(n,i) {
			var previous_number = frames[i-1];
			if (i===0) {
				seq = n.toString();
			} else if (i===frames.length-1) {
				if (previous_number!=n-1) {
					if (seq===previous_number.toString()) {
						mSeq.push(seq);
					} else {
						seq+="-"+previous_number;
						mSeq.push(seq);
					}
					mSeq.push(n.toString());
				} else {
					seq+="-"+n;
					mSeq.push(seq);
				}
			} else {
				if (previous_number!=n-1) {
					if (seq===previous_number.toString()) {
						mSeq.push(seq);
					} else {
						seq+="-"+previous_number;
						mSeq.push(seq);
					}
					seq = n.toString();
				}
			}
		});
		return mSeq;
	}

	function findSequenceFiles(path, listOfFilenames) {
		var codex = {},
			re_vfxseq = new RegExp(/\d+(?!.*\d+)/),
			re_tvepisodes = new RegExp(/(.*S\d\dE)(\d\d)(.*)/i),
		newList = Object.keys(listOfFilenames).map(function(filename) {
			return listOfFilenames[filename];
		}).filter(function(n) {
			return n.type!=='s';
		}).reduce(function(H, file) {
			var pattern = null,
				m, curr;
			if (file.type==='f' && file.name.match(/\w+\d+/)) {
				delete file.isPartOfSequence;
				// WARNING: The order of these RegExs matter!
				if (file.name.match(re_tvepisodes)) {
					pattern = file.name.replace(re_tvepisodes,"$1f__c16b6248ae3__$3");
					m = file.name.match(re_tvepisodes);
					curr = parseInt(m[2], 10);
				} else if (file.name.match(re_vfxseq)) {
					pattern = file.name.replace(re_vfxseq,"__d9c646a0d802__");
					m = file.name.match(re_vfxseq);
					curr = parseInt(m[0], 10);
				}
				if (pattern!==null) {
					if (codex.hasOwnProperty(pattern)) {
						codex[pattern].files.push(file);
						codex[pattern].frames.push(curr);
						if (curr>codex[pattern].high) {
							codex[pattern].high = curr;
						} else if (curr<codex[pattern].low) {
							codex[pattern].low = curr;
						}
					} else {
						codex[pattern] = {
							low: 0,
							high: 0,
							frames: [],
							files: []
						};
						codex[pattern].files.push(file);
						codex[pattern].frames.push(curr);
						codex[pattern].high = curr;
						codex[pattern].low = curr;
					}
				}
			}
			H[file.name] = file;
			return H;
		}, {});

		Object.keys(codex).forEach(function(pattern) {
			var replaceWith, name, last, i;
			if (codex[pattern].files.length>2) {    // If there are less than two files in the sequence, don't group them
				var frameRanges = getFrameRanges(codex[pattern].frames),
					rangesWithOnlyOneFrame = frameRanges.filter(function(range) {
						return range.match(/^\d+$/);
					});
				if (rangesWithOnlyOneFrame.length!==frameRanges.length) {
					replaceWith = frameRanges.join(",") + "@";
					if (pattern.match(/__fc16b6248ae3__/)) {
						name = pattern.replace(/__fc16b6248ae3__/, replaceWith);
					} else {
						name = pattern.replace(/__d9c646a0d802__/, replaceWith);
					}
					codex[pattern].files.forEach(function(file) {
						file.isPartOfSequence = pattern;
					});
					last = codex[pattern].files[codex[pattern].files.length-1];
					var m = moment(last.mtime);
					newList[name] = {
						name: name,
						type: 's',
						href: $window.location.origin + path + "/__seq/" + pattern,
						mtime: last.mtime,
						_mtime: m.format("MMM DD hh:mma"),
						_xtime: m.format("X")
					};
				}
			}
		});

		return newList;
	}

	var subscription = {cancel: angular.noop},
		lastPath = null;

	function attachDOMData(path, file) {
		if (file.type==='f') {
			file._size = filesize(file.size);
			file.href = "/@openbitch" + path + "/" + file.name;
			var ext = file.name.split(".");
			if (!file.name.match(/^\./) && ext.length>1) {
				file._ext = ext.slice(-1)[0].toLowerCase();
			}
		} else {
			file._size = filesize(file.size);
			file.href = path + "/" + file.name;
		}
		var m = moment(file.mtime);
		file._xtime = parseInt(m.format('X'), 10);
		file._mtime = m.format("MMM DD YYYY hh:mma");
	}

	function openFolder(path) {
		var isOpeningSequence = false;
		if (path.match(/__seq/)) {
			isOpeningSequence = true;
			path = path.split("/__seq/")[0];
		}
		$http({
			method: "GET",
			url: "/@spreadbitch" + path
		}).then(function(res) {
			var filesToShow = {};
			if (res.data.total>0) {
				res.data.listing.forEach(function(file) {
					if (!excludeFiles.hasOwnProperty(file.name) &&
						!filesToShow.hasOwnProperty(file.name)) {
						attachDOMData(path, file);
						filesToShow[file.name] = file;
					}
				});
				if (Object.keys(filesToShow).length>0) {
					if (!isOpeningSequence) { $location.path(path); }
					$scope.filelist = findSequenceFiles(path, filesToShow);
					if (lastPath!==null) {
						$http({
							method: 'GET',
							url: "/@abandonbitch" + lastPath
						});
					}
					$http({
						method: "GET",
						url: "/@watchbitch" + path
					}).then(function(resObject) {
						var channel = resObject.data;
						lastPath = path;
						subscription = startSubscription(path, channel);
					});
				} else {
					// TODO: Tell user this folder can't be open
				}
			} else {
				// TODO: Tell user this folder can't be open
			}
		});
	}

	function startSubscription(path, channelId) {
		subscription.cancel();
		return fayeClient.subscribe( fayeBase + "/listenbitch/" + channelId, function(data) {
			var event = data.event,
				file = data.stat;
			if (event==='created') {
				if (!$scope.filelist.hasOwnProperty(file.name)) {
					attachDOMData(path,file);
					$scope.filelist[file.name] = file;
					$scope.$apply(function() {
						$scope.filelist = findSequenceFiles(path, $scope.filelist);
					});
				}
			} else if (event==='deleted') {
				$scope.$apply(function() {
					delete $scope.filelist[file.name];
					$scope.filelist = findSequenceFiles(path, $scope.filelist);
				});
			} else if (event==='changed' && $scope.filelist.hasOwnProperty(file.name)) {
				$scope.$apply(function() {
					attachDOMData(path,file);
					$scope.filelist[file.name] = file;
				});
			}
		});
	}

	$window.addEventListener("popstate", function(e) {
		openFolder($location.path());
	});

});