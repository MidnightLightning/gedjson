var util = require('util');
var Transform = require('stream').Transform;

util.inherits(Ged2Json, Transform);
/**
 * Stream JSON objects out of GEDCOM file
 *
 * Given an object stream that's passing along lines from a GEDCOM file,
 * this Transform Stream will collect them into JSON objects and emit them.
 *
 * As GEDCOM data structures allow some data at the root node as well as
 * child elements on that same node, that data is moved into the `@values`
 * property of the object assigned to that root node, along with any child elements.
 *
 * @param {Object} options
 */
function Ged2Json(options) {
  if (!(this instanceof Ged2Json)) return new Ged2Json(options);

  Transform.call(this, { objectMode: true });
  if (typeof options === 'undefined') {
    options = {};
  }

  this.currentObject = false;
  this.lastLevels = {};
}

Ged2Json.prototype.simplify = function simplify(obj) {
  var keys = Object.keys(obj);
  var parsed;
  var out = {};
  if (keys.length == 1 && keys[0] == '@value') {
    return obj['@value'];
  }
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key == 'ADDR') {
      var value = obj[key];
      if (typeof value['CONT'] !== 'undefined') {
        value['@value'] += '\n'+value['CONT']['@value'];
        delete value['CONT'];
      }
      out[key] = this.simplify(value);
    } else if (key == 'DATE') {
      var value = obj[key];
      if (typeof value['TIME'] !== 'undefined') {
        value['@value'] += ' '+value['TIME']['@value'];
        delete value['TIME'];
      }
      out[key] = this.simplify(value);
    } else if (typeof obj[key] == 'string') {
      if (obj[key] != '') {
        out[key] = obj[key];
      }
    } else {
      out[key] = this.simplify(obj[key]);
    }
  }
  return out;
};

Ged2Json.prototype._transform = function(line, encoding, callback) {
  var s = line.indexOf(' ');
  var level = parseInt(line.slice(0,s));
  var s2 = line.indexOf(' ', s+1);
  var code, value;
  if (s2 !== -1) {
    code = line.slice(s+1, s2);
    value = line.slice(s2+1);
  } else {
    code = line.slice(s+1);
    value = '';
  }
  if (level == 0) {
    // Start new object
    if (this.currentObject !== false) {
      var out = this.simplify(this.currentObject);
      this.push(out); // Pass out of transformer
    }
    this.currentObject = {};
    this.currentObject['@value'] = line.slice(s+1);
    this.lastLevels = {};
    this.lastLevels[0] = this.currentObject;
  } else {
    var parent = this.lastLevels[level-1];
    if (typeof parent === 'undefined') {
      console.log(JSON.stringify(this.lastLevels, null, 2));
      console.log(line);
      throw new Error('No parent for level '+level);
    }
    parent[code] = { '@value': value };
    this.lastLevels[level] = parent[code];
  }
  callback();
};

Ged2Json.prototype._flush = function(callback) {
  if (this.currentObject !== false) {
    this.push(this.simplify(this.currentObject));
  }
  callback();
};


if (require.main == module) {
  // Called from command line
  var fileName = process.argv[2];
  if (typeof fileName == 'undefined' || fileName == '') {
    console.log("No file name specified");
    process.exit();
  }
  var fs = require('fs');
  var FileLines = require('./fileLines');
  var fs = fs
    .createReadStream(fileName)
    .pipe(new FileLines())
    .pipe(new Ged2Json());
  fs.on('data', function(obj) {
    console.log(JSON.stringify(obj, null, 2));
  });
} else {
  module.exports = Ged2Json;
}
