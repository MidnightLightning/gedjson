var util = require('util');
var Transform = require('stream').Transform;

util.inherits(FileLines, Transform);
/**
 * Stream file by line breaks
 *
 * Implements a Node Transform Stream interface, so should be used like:
 * var fileLineStream = fs.createReadStream(filename).pipe(new FileLines());
 *
 * @param {Object} options Set maxInBoundBuffer if desired, to change it from 10 MB default
 */
function FileLines(options) {
  if (!(this instanceof FileLines)) return new FileLines(options);

  Transform.call(this, { objectMode: true });
  if (typeof options === 'undefined') {
    options = {};
  }
  if (typeof options.maxInboundBuffer == 'undefined') {
    options.maxInboundBuffer = 1024*10*10;
  }
  this._inBuffer = new Buffer(options.maxInboundBuffer);
  this._inCursor = 0;
}

FileLines.prototype._transform = function(chunk, encoding, callback) {
  if (chunk.length + this._inCursor > this._inBuffer.length) {
    this.emit('error', new Error('Line parsing exceeded the internal receiving buffer'));
    return;
  }
  chunk.copy(this._inBuffer, this._inCursor);
  this._inCursor += chunk.length;

  var i = 0;
  var lastFound = 0
  while (i < this._inCursor) {
    //console.log(i, this._inBuffer[i], String.fromCharCode(this._inBuffer[i]));
    if (this._inBuffer[i] == 10 || this._inBuffer[i] == 13) {
      this.push(this._inBuffer.toString('utf8', lastFound, i));
      lastFound = i+1;
    }
    i++;
  }

  // Parsed as much as possible, move data and cursor
  this._inBuffer.copy(this._inBuffer, 0, lastFound, this._inCursor);
  this._inCursor -= lastFound;

  callback(); // Done with this chunk
};

FileLines.prototype._flush = function(callback) {
  if (this._inCursor > 0) {
    this.push(this._inBuffer.toString('utf8', 0, this._inCursor));
  }
  callback();
};

module.exports = FileLines;
