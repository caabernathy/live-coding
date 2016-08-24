#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

function printHelpAndExit(exitCode) {
  console.error([
    'Usage: ' + __filename + ' [-p] <one-or-more-files-or-directories-to-watch>',
    '',
    'Options:',
    '  -h, --help    Show this screen',
    '  -p, --public  Start ngrok proxy to let others connect to this server',
  ].join('\n'));
  process.exit(exitCode);
}

var fileNames, allowPublicAccess;
var fileNames = [];

process.argv.slice(2).forEach(function(arg) {
  if (arg == '-h' || arg == '--help') {
    printHelpAndExit(0);
  }
  if (arg == '-p' || arg == '--public') {
    allowPublicAccess = true;
  } else {
    fileNames.push(arg);
  }
});

if (fileNames.length == 0) {
  printHelpAndExit(1);
}

// For accessing info for a file
var snapshotsByFile = {};
var pathToFile = {};

// Get changes
function getSnapshot(fileKey) {
  var fileName = pathToFile[fileKey];
  return {
    content: fs.readFileSync(fileName, 'utf8'),
    modifiedAt: fs.statSync(fileName).mtime.getTime(),
  };
}

// Used to map a file name to a key
function getFileKey(fileName) {
  return fileName.substring(fileName.lastIndexOf('/')+1);
}

// Listener for file changes
var fileWatchListener = function(eventType, fileName) {
  var fileKey = getFileKey(fileName);
  // Check for possible new file
  if (fileKey in snapshotsByFile) {
    var snapshots = snapshotsByFile[fileKey];
    var last = snapshots[snapshots.length - 1];
    var current = getSnapshot(fileKey);
    if (current.content !== last.content && current.content.length > 0) {
      io.emit('change', fileKey, current);
      snapshots.push(current);
      snapshotsByFile[fileKey] = snapshots;
    }
  } else {
    // Temp hack since don't know how to get the directory
    pathToFile[fileKey] = '/Users/caabernathy/Facebook/Events/MEAPartnerWorkshop/CodeLab/quizzer/ReactNative/js/'+fileKey;
    var snapshot = getSnapshot(fileKey);
    snapshotsByFile[fileKey] = [snapshot];
    io.emit('add', fileKey, snapshot);
  }
};

function initFileInfo(fileName) {
  var fileKey = getFileKey(fileName);
  pathToFile[fileKey] = fileName;
  var snapshot = getSnapshot(fileKey);
  snapshotsByFile[fileKey] = [snapshot];
}

// Initialize
fileNames.forEach(function(fileName) {
  // If input is directory, get all the .js files under it
  // set up the initial info
  if (fs.statSync(fileName).isDirectory()) {
    var files = fs.readdirSync(fileName);
    files.forEach(function(file) {
      if (path.extname(file) === ".js") {
        initFileInfo(fileName+'/'+file);
      }
    });
  } else {
    initFileInfo(fileName);
  }
  // Watch file or directory
  fs.watch(fileName, fileWatchListener);
});

io.on('connection', function (socket) {
  socket.emit('init', snapshotsByFile);
});

console.log('Serving files on http://localhost:3030/');

if (allowPublicAccess) {
  var ngrok = require('ngrok');
  ngrok.connect({
    addr: 3030
  }, function (err, url) {
    console.log('Public URL:', url);
  });
}

app.use(express.static(path.join(__dirname, 'public')));
server.listen(3030);
