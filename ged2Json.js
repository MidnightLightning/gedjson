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
 * child elements on that same node, that data is moved into the `GEDVALUE`
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
  if (keys.length == 1 && keys[0] == 'GEDVALUE') {
    return obj['GEDVALUE'];
  }
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Array.isArray(obj[key])) {
      obj[key] = [obj[key]];
    }
    if (key == 'ADDR') {
      out[key] = obj[key].map(function(el) {
        if (typeof el['CONT'] !== 'undefined') {
          el['GEDVALUE'] += '\n'+el['CONT']['GEDVALUE'];
          delete el['CONT'];
        }
        return this.simplify(el);
      }.bind(this));
    } else if (key == 'DATE') {
      out[key] = obj[key].map(function(el) {
        if (typeof el['TIME'] !== 'undefined') {
          el['GEDVALUE'] += ' '+el['TIME']['GEDVALUE'];
          delete el['TIME'];
        }
        return this.simplify(el);
      }.bind(this));
    } else {
      out[key] = obj[key].map(function(el) {
        if (typeof el == 'string') {
          return el;
        }
        return this.simplify(el);
      }.bind(this));
    }
    if (out[key].length === 1) {
      out[key] = out[key][0];
    }
    if (out[key] === '') {
      delete out[key];
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
    this.currentObject['GEDVALUE'] = line.slice(s+1);
    this.lastLevels = {};
    this.lastLevels[0] = this.currentObject;
  } else {
    var parent = this.lastLevels[level-1];
    if (typeof parent === 'undefined') {
      console.log(JSON.stringify(this.lastLevels, null, 2));
      console.log(line);
      throw new Error('No parent for level '+level);
    }
    var newItem = { 'GEDVALUE': value };
    if (typeof parent[code] === 'undefined') {
      parent[code] = newItem;
    } else {
      if (!Array.isArray(parent[code])) {
        parent[code] = [parent[code]];
      }
      parent[code].push(newItem);
    }
    this.lastLevels[level] = newItem;
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
