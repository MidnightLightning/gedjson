var fs = require('fs');
var FileLines = require('./fileLines');

function simplify(obj) {
  var keys = Object.keys(obj);
  var out = {};
  if (keys.length == 1 && keys[0] == '@value') {
    if (obj['@value'][0] == '@') {
      // Value is an ID
      var parsed = transformId(obj['@value']);
      out['@id'] = parsed['@id'];
      return out;
    }
    return obj['@value'];
  }
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key == '@id') {
      // Value is an ID
      var parsed = transformId(obj[key]);
      out['@id'] = parsed['@id'];
      if (parsed['@type'] != '') {
        out['@type'] = parsed['@type'];
      }
    } else if (key == 'ADDR') {
      var value = obj[key];
      if (typeof value['CONT'] !== 'undefined') {
        value['@value'] += '\n'+value['CONT']['@value'];
        delete value['CONT'];
      }
      out[key] = simplify(value);
    } else if (key == 'DATE') {
      var value = obj[key];
      if (typeof value['TIME'] !== 'undefined') {
        value['@value'] += ' '+value['TIME']['@value'];
        delete value['TIME'];
      }
      out[key] = simplify(value);
    } else if (typeof obj[key] == 'string') {
      if (obj[key] != '') {
        out[key] = obj[key];
      }
    } else {
      out[key] = simplify(obj[key]);
    }
  }
  return out;
}
function transformId(raw) {
  var out = {
    '@id': '',
    '@type': ''
  };
  if (raw[0] !== '@') {
    out['@id'] = raw;
    return out;
  }
  var pieces = raw.split(' ');
  pieces[0] = pieces[0].replace(/@/g, '');
  out['@id'] = '_:'+pieces[0];
  if (pieces.length > 1) {
    out['@type'] = '_:'+pieces.slice(1).join(' ');
  }
  return out;
}
function setContexts(obj) {
  if (obj['@type'] == '_:INDI') {
    obj['@type'] = 'foaf:Person';
    obj = renameProperty(obj, 'NAME', 'foaf:name');
    obj = renameProperty(obj, 'SEX', 'foaf:gender');
    if (typeof obj['BIRT'] !== 'undefined') {
      obj = renameProperty(obj, 'BIRT', 'bio:birth');
      obj['bio:birth']['bio:principal'] = { '@id': obj['@id'] };
      obj['bio:birth'] = renameProperty(obj['bio:birth'], 'PLAC', 'bio:place');
    }
  } else if (obj['@type'] == '_:FAM') {
    obj['@type'] = 'bio:Marriage';
    var partners = [];
    if (typeof obj['HUSB'] !== 'undefined') {
      partners.push(obj['HUSB']);
      delete obj['HUSB'];
    }
    if (typeof obj['WIFE'] !== 'undefined') {
      partners.push(obj['WIFE']);
      delete obj['WIFE'];
    }
    obj['bio:partner'] = partners;
  }

  return obj;
}
function renameProperty(obj, oldName, newName) {
  if (typeof obj[oldName] !== 'undefined') {
    obj[newName] = obj[oldName];
    delete obj[oldName];
  }
  return obj;
}

var filename = process.argv[2];
if (typeof filename === 'undefined' || filename == '') {
  console.log('Need to supply path to GED file');
  process.exit();
}
console.log('parsing '+filename+'...');

var fs = fs.createReadStream(filename).pipe(new FileLines());
var data = [];
var cur = false;
var lastLevels = {};
fs.on('data', function(line) {
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
    if (cur !== false) {
      var out = setContexts(simplify(cur));
      data.push(out);
    }
    cur = {};
    cur['@id'] = code+' '+value;
    lastLevels = {};
    lastLevels[0] = cur;
  } else {
    var parent = lastLevels[level-1];
    if (typeof parent === 'undefined') {
      console.log(JSON.stringify(lastLevels, null, 2));
      console.log(line);
      throw new Error('No parent for level '+level);
    }
    parent[code] = { '@value': value };
    lastLevels[level] = parent[code];
  }
  //console.log(line);
});
fs.on('end', function() {
  var graph = {
    '@context': {
      'foaf': 'http://xmlns.com/foaf/0.1/',
      'rel': 'http://purl.org/vocab/relationship',
      'bio': 'http://purl.org/vocab/bio/0.1/'
    },
    '@graph': data
  };
  console.log(JSON.stringify(graph, null, 2));
});
