var fs = require('fs');
var FileLines = require('./fileLines');

function simplify(obj) {
  var keys = Object.keys(obj);
  var parsed;
  var out = {};
  if (keys.length == 1 && keys[0] == '@value') {
    if (obj['@value'][0] == '@') {
      // Value is an ID
      parsed = transformId(obj['@value']);
      out['@id'] = parsed['@id'];
      return out;
    }
    return obj['@value'];
  }
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key == '@id') {
      // Value is an ID
      parsed = transformId(obj[key]);
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
      out['dc:date'] = simplify(value);
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
    out['@id'] = '_:'+raw.trim();
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
    // Process Individual object
    obj['@type'] = 'foaf:Person';
    obj = renameProperty(obj, 'NAME', 'foaf:name');
    obj = renameProperty(obj, 'SEX', 'foaf:gender');
    obj = simplifyIndividualEvent(obj, 'BIRT', 'bio:Birth');
    obj = simplifyIndividualEvent(obj, 'CHR', 'bio:Baptism');
    obj = simplifyIndividualEvent(obj, 'CHRA', 'bio:Baptism');
    obj = simplifyIndividualEvent(obj, 'BAPM', 'bio:Baptism');
    obj = simplifyIndividualEvent(obj, 'BLES', 'bio:Baptism');
    obj = simplifyIndividualEvent(obj, 'DEAT', 'bio:Death');
    obj = simplifyIndividualEvent(obj, 'BURI', 'bio:Burial');
    obj = simplifyIndividualEvent(obj, 'CREM', 'bio:Cremation');
    obj = simplifyIndividualEvent(obj, 'ADOP', 'bio:Adoption');
    obj = simplifyIndividualEvent(obj, 'BARM', 'bio:BarMitzvah');
    obj = simplifyIndividualEvent(obj, 'BASM', 'bio:BasMitzvah');
    obj = simplifyIndividualEvent(obj, 'CONF', 'bio:IndividualEvent', 'Confirmation');
    obj = simplifyIndividualEvent(obj, 'FCOM', 'bio:IndividualEvent', 'First Communion');
    obj = simplifyIndividualEvent(obj, 'ORDN', 'bio:Ordination');
    obj = simplifyIndividualEvent(obj, 'NATU', 'bio:Naturalization');
    obj = simplifyIndividualEvent(obj, 'EMIG', 'bio:Emigration');
    obj = simplifyIndividualEvent(obj, 'IMMI', 'bio:IndividualEvent', 'Immigration');
    obj = simplifyIndividualEvent(obj, 'PROB', 'bio:IndividualEvent', 'Probate');
    obj = simplifyIndividualEvent(obj, 'WILL', 'bio:IndividualEvent', 'Will');
    obj = simplifyIndividualEvent(obj, 'GRAD', 'bio:Graduation');
    obj = simplifyIndividualEvent(obj, 'RETI', 'bio:Retirement');
    obj = simplifyIndividualEvent(obj, 'EVEN', 'bio:IndividualEvent');

    obj = renameProperty(obj, 'FAMS', 'bio:relationship');
  } else if (obj['@type'] == '_:FAM') {
    // Process Family object
    obj['@type'] = 'bio:Relationship';
    obj = renameProperty(obj, 'HUSB', 'bio:participant');
    obj = renameProperty(obj, 'WIFE', 'bio:participant');

    obj = simplifyGroupEvent(obj, 'ANUL', 'bio:Annulment');
    obj = simplifyGroupEvent(obj, 'DIV', 'bio:Divorce');
    obj = simplifyGroupEvent(obj, 'DIVF', 'bio:GroupEvent', 'Divorce Filed');
    obj = simplifyGroupEvent(obj, 'MARR', 'bio:Marriage');
    obj = simplifyGroupEvent(obj, 'MARB', 'bio:GroupEvent', 'Marriage Announcement');
    obj = simplifyGroupEvent(obj, 'MARC', 'bio:GroupEvent', 'Marriage Contract');
    obj = simplifyGroupEvent(obj, 'MARL', 'bio:GroupEvent', 'Marriage License');
    obj = simplifyGroupEvent(obj, 'MARS', 'bio:GroupEvent', 'Marriage Settlement');
    obj = simplifyGroupEvent(obj, 'EVEN', 'bio:GroupEvent');
  }

  return obj;
}
function renameProperty(obj, oldName, newName) {
  if (typeof obj[oldName] === 'undefined') return obj;
  if (typeof obj[newName] !== 'undefined') {
    // New property already exists; append
    if (!Array.isArray(obj[newName])) {
      obj[newName] = [obj[newName]];
    }
    obj[newName].push(obj[oldName]);
  } else {
    obj[newName] = obj[oldName];
  }
  delete obj[oldName];
  return obj;
}
function simplifyIndividualEvent(obj, oldName, newClass, label) {
  if (typeof obj[oldName] === 'undefined') return obj;
  obj[oldName]['bio:principal'] = {'@id': obj['@id']};
  obj[oldName]['@type'] = newClass;
  if (typeof label !== 'undefined') obj[oldName]['rdf:label'] = label;
  obj[oldName] = renameProperty(obj[oldName], 'PLAC', 'bio:place');
  obj = renameProperty(obj, oldName, 'bio:event');
  return obj;
}
function simplifyGroupEvent(obj, oldName, newClass, label) {
  if (typeof obj[oldName] === 'undefined') return obj;
  var participant = obj['bio:participant'];
  obj[oldName]['bio:partner'] = participant;
  obj[oldName]['@type'] = newClass;
  if (typeof label !== 'undefined') obj[oldName]['rdf:label'] = label;
  obj[oldName] = renameProperty(obj[oldName], 'PLAC', 'bio:place');
  obj = renameProperty(obj, oldName, 'bio:event');
  return obj;
}

var filename = process.argv[2];
if (typeof filename === 'undefined' || filename == '') {
  console.log('Need to supply path to GED file');
  process.exit();
}

var fs = fs.createReadStream(filename).pipe(new FileLines());
var graph = {
  '@context': {
    'foaf': 'http://xmlns.com/foaf/0.1/',
    'rel': 'http://purl.org/vocab/relationship',
    'bio': 'http://purl.org/vocab/bio/0.1/',
    'dc': 'http://purl.org/dc/elements/1.1/'
  }
};
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

      if (out['@id'] == '_:HEAD') {
        // Transplant into graph metadata
        for (var prop in out) {
          if (!out.hasOwnProperty(prop) || prop == '@id') continue;
          graph[prop] = out[prop];
        }
      } else if (out['@id'] == '_:SUBM') {
        graph['SUBM'] = out;
      } else {
        data.push(out);
      }
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
  graph['@graph'] = data;
  console.log(JSON.stringify(graph, null, 2));
});
