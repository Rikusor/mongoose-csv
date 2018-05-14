
'use strict';

var _ = require('lodash');
var mapstream = require('map-stream');
var mongoose;

// support npm-link include style
try {
  mongoose = require('mongoose');
} catch(e) {
  var prequire = require('parent-require');
  mongoose = prequire('mongoose');
}

// supress mongoose promise warning
mongoose.Promise = global.Promise;

module.exports = function(schema, options) {

  // discover properties for use with headers / serializing
  var props = find_props(schema);
  var headers = find_props(schema);

  schema.statics.csv_header = function(includeOnly, additonalHeaderReplacements) {
    if (typeof includeOnly !== 'undefined' && includeOnly.length > 0) {
      headers = headers.filter(function(header) {
        return includeOnly.indexOf(header) > -1;
      });
    }

    if (typeof options !== 'undefined' && options.replaceHeaderNames) {
      var headersToBeReplace = Object.keys(options.replaceHeaderNames);

      for (var i = headers.length - 1; i >= 0; i--) {
        if (headersToBeReplace.indexOf(headers[i]) > -1) {
          headers[i] = options.replaceHeaderNames[headers[i]];
        }
      }
    }

    if (typeof additonalHeaderReplacements !== 'undefined' && Object.keys(additonalHeaderReplacements).length > 0) {
      var headersToBeReplace = Object.keys(additonalHeaderReplacements);

      for (var i = headers.length - 1; i >= 0; i--) {
        if (headersToBeReplace.indexOf(headers[i]) > -1) {
          headers[i] = additonalHeaderReplacements[headers[i]];
        }
      }
    }
    return array_to_row(headers);
  };

  schema.methods.toCSV = function(includeOnly) {
    var doc = this;
    var json = doc.toJSON({ deleted : true, virtuals : true });

    if (typeof includeOnly !== 'undefined' && includeOnly.length > 0) {
      props = props.filter(function(prop) {
        return includeOnly.indexOf(prop) > -1;
      });
    }
    // map the props to values in this doc
    return array_to_row(props.map(function(prop) {
      return _.get(json, prop);
    }));
  };

  // register a global static function to stream a file repsonse
  if (mongoose.Query.prototype.csv) return;
  mongoose.Query.prototype.csv = function(stream, includeOnly, additonalHeaderReplacements) {

    // write header
    stream.write(this.model.csv_header(includeOnly, additonalHeaderReplacements));

    //  handle Mongoose >= 4.5
    var cursor = this.cursor ? this.cursor() : this.stream();

    // write data
    return cursor
      .pipe(mapstream(function(data, cb) {
        cb(null, data.toCSV(includeOnly));
      }))
      .pipe(stream);
  };

};

// walk the paths, rejecting those that opt-out
function find_props(schema, includeOnly) {

  var props = _(schema.paths).keys().without('_id', 'id')

  // transform the schema tree into an array for filtering
    .map(function(key) { return { name : key, value : _.get(schema.tree, key) }; })

    // remove paths that are annotated with csv: false
    .filter(function(node) {
      return typeof node.value.csv === 'undefined' || node.value.csv;
    })

    // remove virtuals that are annotated with csv: false
    .filter(function(node) {
      var opts = node.value.options;
      if (!opts) return true;
      return typeof opts.csv === 'undefined' || opts.csv;
    })

    // remove complex object types
    .filter(function(node) {
      var path = schema.paths[node.name];
      if (!path) return true;
      // filter out any of these types of properties
      return [ 'Array', 'Object', 'Mixed' ].indexOf(path.instance) === -1;
    })

    // materialize , end chain
    .pluck('name').value();

  // _id at the end
  props.push('_id');

  return props;
}


// generate the line in the CSV file
function array_to_row(arr) {
  return arr.map(prop_to_csv).join(';') + '\n';
}

// return empty string if not truthy, escape quotes
function prop_to_csv(prop) {

  var val = String(prop);
  if (typeof val === 'undefined' || val === 'undefined' || val.length < 1) return '';

  return val;
}
