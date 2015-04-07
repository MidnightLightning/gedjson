var fs = require('fs');
var FileLines = require('./fileLines');
var Ged2Json = require('./ged2Json');


// Utility functions

/**
 * Set a property on an object to a value
 *
 * If the value is an array with only one element in it,
 * assign just that single element to the property
 * @param {Object} obj   Target object
 * @param {String} prop  Property name to set
 * @param {Object} value Value to set the property to
 */
function setProperty(obj, prop, value) {
  if (Array.isArray(value) && value.length == 0) {
    delete obj[prop];
  } else if (Array.isArray(value) && value.length == 1) {
    obj[prop] = value[0];
  } else {
    obj[prop] = value;
  }
}

/**
 * Sets or appends a value to a given property
 *
 * If the designated property is undefined, set it to the given value.
 * Otherwise, append it (if it's already an array) or make it an array of the
 * old value and the new value
 * @param {Object} obj   Target object
 * @param {String} prop  Property name to set
 * @param {Object} value Value to set the property to
 */
function setOrAdd(obj, prop, value) {
  if (typeof obj[prop] === 'undefined') {
    setProperty(obj, prop, value);
  } else {
    setProperty(obj, prop, asArray(obj, prop).concat(value));
  }
}

/**
 * Cast a property to an array
 *
 * Get the value of a given property, and force the return value to be an array.
 * Thus, if the property is undefined, an empty array is returned.
 * If the property has a single object, an array with that one item is returned.
 * Otherwise, the property value itself (an array) is returned.
 * @param {Object} obj   Target object
 * @param {String} prop  Property name to get
 */
function asArray(obj, prop) {
  if (typeof obj[prop] == 'undefined') return [];
  if (Array.isArray(obj[prop])) return obj[prop];
  return [obj[prop]];
}

/**
 * Perform an action on each element of a property value
 *
 * Perform the callback on the given property. If that property is an array,
 * apply the callback to each element of the array. If it's a single value,
 * apply it to just that value. Callback is assumed to be a transformation;
 * return the transformed object to be set in place of the old.
 * @param {Object}   obj      Target object
 * @param {String}   prop     Property name to get
 * @param {Function} callback Function to apply to each value
 */
function parseProperty(obj, prop, callback) {
  if (typeof obj[prop] === 'undefined') {
    return;
  }
  if (Array.isArray(obj[prop])) {
    obj[prop] = obj[prop].map(callback);
  } else {
    obj[prop] = callback(obj[prop]);
  }
}

/**
 * Perform a filtering action on each element of a property value
 *
 * Filter a value by a given callback. If the property is an array,
 * apply the callback as a filter method, and save the result back to the
 * same property. If it's a single value, cast it to an array of that
 * single value and then filter by the callback. If the resulting of the filter
 * is an array of no values, the property is deleted.
 * @param {Object}   obj      Target object
 * @param {String}   prop     Property name to get
 * @param {Function} callback Function to apply to each value
 */
function filterProperty(obj, prop, callback) {
  if (typeof obj[prop] === 'undefined') {
    return;
  }
  var newValue = asArray(obj, prop).filter(callback);
  setProperty(obj, prop, newValue);
}

/**
 * Rename a property on an object to a new name.
 *
 * Verifies the old name exists before attempting a rename. If the new name
 * already exists, merges the moving value into the target property.
 * @param {Object} obj     Target object
 * @param {String} oldName Property to move from
 * @param {String} newName Property to move to
 */
function renameProperty(obj, oldName, newName) {
  if (typeof obj[oldName] === 'undefined') return obj;
  setOrAdd(obj, newName, obj[oldName]);
  delete obj[oldName];
}

/**
 * Convert a raw GEDCOM JSON object into a JSON-LD-structured one
 * @param  {Object} obj Target object
 */
function simplify(obj) {
  var keys = Object.keys(obj);
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Array.isArray(obj[key])) {
      obj[key] = [obj[key]];
    }
    out[key] = obj[key].filter(function(el) {
      if (typeof el == 'string') {
        return el !== '';
      }
      return true;
    }).map(function(el) {
      if (typeof el == 'string') {
        if (el[0] == '@') {
          // Value is an ID
          var parsed = transformId(el);
          if (key == '@value') {
            // This is the ID of the current object
            return parsed;
          } else {
            return {'@id': parsed['@id']};
          }
        } else {
          return el;
        }
      } else {
        return simplify(el);
      }
    });
    if (out[key].length == 1) {
      out[key] = out[key][0];
    }
    if (typeof out['@value'] !== 'undefined' && typeof out['@value']['@id'] !== 'undefined') {
      var nested = out['@value'];
      out['@id'] = nested['@id'];
      if (nested['@type'] !== '') {
        out['@type'] = nested['@type'];
      }
      delete out['@value'];
    }
  }

  renameProperty(out, 'DATE', 'dc:date');
  return out;
}

/**
 * Transform an ID from GEDCOM to RDF format
 *
 * Take an ID like "@I001@ INDI" and change it into:
 * {
 *   "@id": "_:I001",
 *   "@type": "_:INDI"
 * }
 * @param {String} raw GEDCOM-formatted ID
 */
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

/**
 * Rename and re-contextualize a JSON object
 * @param {Object} obj Target object
 */
function setContexts(obj) {
  if (obj['@type'] == '_:INDI') {
    // Process Individual object
    obj['@type'] = 'foaf:Person';
    renameProperty(obj, 'NAME', 'foaf:name');
    renameProperty(obj, 'SEX', 'foaf:gender');
    if (typeof obj['FAMC'] !== 'undefined') {
      var famId = obj['FAMC']['@id'];
      obj['FAMC']['ofFamily'] = { '@id': famId };
      delete obj['FAMC']['@id'];
    }
    simplifyIndividualEvent(obj, 'BIRT', 'bio:Birth');
    simplifyIndividualEvent(obj, 'CHR', 'bio:Baptism');
    simplifyIndividualEvent(obj, 'CHRA', 'bio:Baptism');
    simplifyIndividualEvent(obj, 'BAPM', 'bio:Baptism');
    simplifyIndividualEvent(obj, 'BLES', 'bio:Baptism');
    simplifyIndividualEvent(obj, 'DEAT', 'bio:Death');
    simplifyIndividualEvent(obj, 'BURI', 'bio:Burial');
    simplifyIndividualEvent(obj, 'CREM', 'bio:Cremation');
    simplifyIndividualEvent(obj, 'ADOP', 'bio:Adoption');
    simplifyIndividualEvent(obj, 'BARM', 'bio:BarMitzvah');
    simplifyIndividualEvent(obj, 'BASM', 'bio:BasMitzvah');
    simplifyIndividualEvent(obj, 'CONF', 'bio:IndividualEvent', 'Confirmation');
    simplifyIndividualEvent(obj, 'FCOM', 'bio:IndividualEvent', 'First Communion');
    simplifyIndividualEvent(obj, 'ORDN', 'bio:Ordination');
    simplifyIndividualEvent(obj, 'NATU', 'bio:Naturalization');
    simplifyIndividualEvent(obj, 'EMIG', 'bio:Emigration');
    simplifyIndividualEvent(obj, 'IMMI', 'bio:IndividualEvent', 'Immigration');
    simplifyIndividualEvent(obj, 'PROB', 'bio:IndividualEvent', 'Probate');
    simplifyIndividualEvent(obj, 'WILL', 'bio:IndividualEvent', 'Will');
    simplifyIndividualEvent(obj, 'GRAD', 'bio:Graduation');
    simplifyIndividualEvent(obj, 'RETI', 'bio:Retirement');
    simplifyIndividualEvent(obj, 'EVEN', 'bio:IndividualEvent');

    renameProperty(obj, 'FAMS', 'bio:relationship');
  } else if (obj['@type'] == '_:FAM') {
    // Process Family object
    obj['@type'] = 'bio:Relationship';
    renameProperty(obj, 'HUSB', 'bio:participant');
    renameProperty(obj, 'WIFE', 'bio:participant');

    simplifyGroupEvent(obj, 'ANUL', 'bio:Annulment');
    simplifyGroupEvent(obj, 'DIV', 'bio:Divorce');
    simplifyGroupEvent(obj, 'DIVF', 'bio:GroupEvent', 'Divorce Filed');
    simplifyGroupEvent(obj, 'ENGA', 'bio:GroupEvent', 'Engagement');
    simplifyGroupEvent(obj, 'MARR', 'bio:Marriage');
    simplifyGroupEvent(obj, 'MARB', 'bio:GroupEvent', 'Marriage Announcement');
    simplifyGroupEvent(obj, 'MARC', 'bio:GroupEvent', 'Marriage Contract');
    simplifyGroupEvent(obj, 'MARL', 'bio:GroupEvent', 'Marriage License');
    simplifyGroupEvent(obj, 'MARS', 'bio:GroupEvent', 'Marriage Settlement');
    simplifyGroupEvent(obj, 'EVEN', 'bio:GroupEvent');
  }

  return obj;
}

/**
 * Parse an Individual Event object
 * @param {Object} obj      Target object
 * @param {String} oldName  Old property name
 * @param {String} newClass New property name
 * @param {String} label    Label for event (optional)
 */
function simplifyIndividualEvent(obj, oldName, newClass, label) {
  if (typeof obj[oldName] === 'undefined') return obj;
  parseProperty(obj, oldName, function(el) {
    if (el == 'Y') el = {};
    el['bio:principal'] = {'@id': obj['@id']};
    el['@type'] = newClass;
    if (typeof label !== 'undefined') el['rdf:label'] = label;
    renameProperty(el, 'PLAC', 'bio:place');
    return el;
  });
  renameProperty(obj, oldName, 'bio:event');
}

/**
 * Parse a Group Event object
 * @param {Object} obj      Target object
 * @param {String} oldName  Old property name
 * @param {String} newClass New property name
 * @param {String} label    Label for event (optional)
 */
function simplifyGroupEvent(obj, oldName, newClass, label) {
  if (typeof obj[oldName] === 'undefined') return obj;
  var participant = obj['bio:participant'];
  parseProperty(obj, oldName, function(el) {
    if (el == 'Y') el = {};
    el['bio:partner'] = participant;
    el['@type'] = newClass;
    if (typeof label !== 'undefined') el['rdf:label'] = label;
    renameProperty(el, 'PLAC', 'bio:place');
    return el;
  });
  renameProperty(obj, oldName, 'bio:event');
}



// Main process start
var filename = process.argv[2];
if (typeof filename === 'undefined' || filename == '') {
  console.log('Need to supply path to GED file');
  process.exit();
}

var fs = fs
  .createReadStream(filename)
  .pipe(new FileLines())
  .pipe(new Ged2Json());
var graph = {
  '@context': {
    'foaf': 'http://xmlns.com/foaf/0.1/',
    'rel': 'http://purl.org/vocab/relationship',
    'bio': 'http://purl.org/vocab/bio/0.1/',
    'dc': 'http://purl.org/dc/elements/1.1/'
  }
};

var knownObjects = {};
function parseKnownObjects() {
  var keys = Object.keys(knownObjects);
  graph['@graph'] = [];
  for (var i = 0; i < keys.length; i++) {
    var objId = keys[i];
    var obj = knownObjects[keys[i]];
    if (obj['@type'] == 'foaf:Person') {
      // Add additional linkages for this person
      if (typeof obj['bio:relationship'] !== 'undefined') {
        // Look up marriages, to find spouse and any children
        var relationships = asArray(obj, 'bio:relationship');
        for (var j = 0; j < relationships.length; j++) {
          var fam = knownObjects[relationships[j]['@id']];
          var tmp = findSpouses(fam, obj['@id']);
          if (tmp !== false) {
            setOrAdd(obj, tmp.relationship, tmp.spouses);
          }
        }
      }
      if (typeof obj['FAMC'] !== 'undefined') {
        // Look up family, to find parents
        var parentFam = knownObjects[obj['FAMC']['ofFamily']['@id']];
        var parents = findParents(parentFam, obj['@id']);
        if (parents !== false) {
          var childId = obj['@id'];
          function setChild(i) {
            var parent = knownObjects[i['@id']];
            setOrAdd(parent, 'bio:child', {'@id':childId});
            if (typeof parent['rel:parentOf'] !== 'undefined') {
              setProperty(parent, 'rel:parentOf', asArray(parent, 'rel:parentOf').filter(function(i) {
                return i['@id'] !== childId;
              }));
            }
            return i;
          }
          var merged = parents.fathers.concat(parents.mothers);
          if (merged.length > 0) {
            setOrAdd(obj, 'rel:childOf', merged);
            merged.map(function(i) {
              setOrAdd(knownObjects[i['@id']], 'rel:parentOf', {'@id':childId});
            });
          }
          if (parents.siblings.length > 0) {
            setOrAdd(obj, 'rel:siblingOf', parents.siblings);
          }
          if (parents.bioMothers.length > 0) {
            setOrAdd(obj, 'bio:mother', parents.bioMothers);
            filterProperty(obj, 'rel:childOf', function(c) {
              for (var i = 0; i < parents.bioMothers.length; i++) {
                if (parents.bioMothers[i]['@id'] == c['@id']) {
                  return false;
                }
              }
              return true;
            });
            parents.bioMothers.map(setChild);
            parseProperty(obj, 'bio:event', function(e) {
              if (e['@type'] == 'bio:Birth') {
                setOrAdd(e, 'bio:parent', parents.bioMothers);
              }
              return e;
            });
          }
          if (parents.bioFathers.length > 0) {
            setOrAdd(obj, 'bio:father', parents.bioFathers);
            filterProperty(obj, 'rel:childOf', function(c) {
              for (var i = 0; i < parents.bioFathers.length; i++) {
                if (parents.bioFathers[i]['@id'] == c['@id']) {
                  return false;
                }
              }
              return true;
            });
            parents.bioFathers.map(setChild);
            parseProperty(obj, 'bio:event', function(e) {
              if (e['@type'] == 'bio:Birth') {
                setOrAdd(e, 'bio:parent', parents.bioFathers);
              }
              return e;
            });
          }
          if (typeof obj['FAMC']['PEDI'] !== 'undefined' && (obj['FAMC']['PEDI'].toLowerCase() == 'natural' || obj['FAMC']['PEDI'].toLowerCase() == 'birth')) {
            setOrAdd(obj, 'bio:father', parents.fathers);
            setOrAdd(obj, 'bio:mother', parents.mothers);
            filterProperty(obj, 'rel:childOf', function(c) {
              for (var i = 0; i < merged.length; i++) {
                if (merged[i]['@id'] == c['@id']) {
                  return false;
                }
              }
              return true;
            });
            parseProperty(obj, 'bio:event', function(e) {
              if (e['@type'] == 'bio:Birth') {
                setOrAdd(e, 'bio:parent', merged);
              }
            });
            parents.fathers.map(setChild);
            parents.mothers.map(setChild);
          }
        }
      }
    }
    graph['@graph'].push(obj);
  }
  console.log(JSON.stringify(graph, null, 2));
}

/**
 * Iterate through a family object and find parents/spouses
 *
 * Given an ID of one of the parents of a family,
 * find all other parents in that family, and based on the events present
 * on the family, determine the relationship from that parent to the others.
 * @param {Object} fam     Family Object to parse
 * @param {String} knownId ID of one of the parents
 */
function findSpouses(fam, knownId) {
  var out = {
    spouses: [],
    relationship: false
  };
  var participants = fam['bio:participant'];
  if (typeof participants === 'undefined') {
    //console.log("Relationship "+fam['@id']+" has no participants");
    return false;
  }
  if (!Array.isArray(participants)) participants = [participants];
  out.spouses = participants.filter(function(el) {
    return el['@id'] !== knownId;
  });

  var events = fam['bio:event'];
  if (typeof events === 'undefined') {
    //console.log("Relationship "+fam['@id']+" has no events");
    return false;
  }
  if (!Array.isArray(events)) events = [events];
  for (var i = 0; i < events.length; i++) {
    if (events[i]['@type'] == 'bio:Marriage') {
      out.relationship = 'rel:spouseOf';
      i = events.length; // Skip rest
    } else if (events[i]['rdf:label'] == 'Engagement') {
      if (out.relationship === false) {
        out.relationship = 'rel:engagedTo';
      }
    }
  }
  return out;
}

/**
 * Iterate through a family object and find parents/siblings
 *
 * Given an ID of one of the children of a family,
 * find all other children and parents in that family, and based on the _FREL
 * or _MREL (if present) determine the relationship to the parents of that family.
 * @param {Object} fam     Family Object to parse
 * @param {String} knownId ID of one of the parents
 */
function findParents(fam, knownId) {
  var parents = fam['bio:participant'];
  var i;
  var rs = {
    'fathers': [],
    'bioFathers': [],
    'mothers': [],
    'bioMothers': [],
    'siblings': []
  };
  if (typeof parents === 'undefined') {
    parents = [];
  }
  if (!Array.isArray(parents)) parents = [parents];

  // Find this individual's child reference
  var children = fam['CHIL'];
  if (typeof children === 'undefined') {
    children = [];
  }
  if (!Array.isArray(children)) children = [children];
  var childRef = false;
  for (i = 0; i < children.length; i++) {
    if (children[i]['@id'] == knownId) {
      childRef = children[i];
      i = children.length;
    }
  }
  var femaleStrings = ['f', 'female', 'fem'];
  for (i = 0; i < parents.length; i++) {
    var parent = knownObjects[parents[i]['@id']];
    if (typeof parent === 'undefined') {
      console.log("Can't find individual "+parents[i]['@id']);
      continue;
    }
    var gender = parent['foaf:gender'].toLowerCase();
    if (femaleStrings.indexOf(gender) !== -1) {
      rs.mothers.push(parents[i]);
      if (childRef !== false && childRef['_MREL'].toLowerCase() == 'natural') {
        rs.bioMothers.push(parents[i]);
      }
    } else {
      rs.fathers.push(parents[i]);
      if (childRef !== false && childRef['_FREL'].toLowerCase() == 'natural') {
        rs.bioFathers.push(parents[i]);
      }
    }
  }

  var children = fam['CHIL'];
  if (typeof children === 'undefined') {
    children = [];
  }
  if (!Array.isArray(children)) children = [children];
  for (var i = 0; i < children.length; i++) {
    var childId = children[i]['@id'];
    if (childId != knownId) {
      rs.siblings.push({'@id': childId});
    }
  }

  return rs;
}

fs.on('data', function(obj) {
  if (typeof obj === 'string') return;
  obj = setContexts(simplify(obj));
  if (obj['@id'] == '_:HEAD') {
    // Transplant into graph metadata
    for (var prop in obj) {
      if (!obj.hasOwnProperty(prop) || prop == '@id') continue;
      graph[prop] = obj[prop];
    }
  } else if (obj['@id'] == '_:SUBM') {
    graph['SUBM'] = obj;
  } else {
    knownObjects[obj['@id']] = obj;
  }
});
fs.on('end', function() {
  parseKnownObjects();
});
