
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
    props = find_props(schema);
    headers = find_props(schema);

    let headersTemp = [...headers];

    if (typeof includeOnly !== 'undefined' && includeOnly.length > 0) {
      headersTemp = headersTemp.filter(function(header) {
        return includeOnly.indexOf(header) > -1;
      });
    }

    if (typeof options !== 'undefined' && options.replaceHeaderNames) {
      var headersToBeReplace = Object.keys(options.replaceHeaderNames);

      for (var i = headersTemp.length - 1; i >= 0; i--) {
        if (headersToBeReplace.indexOf(headersTemp[i]) > -1) {
          headersTemp[i] = options.replaceHeaderNames[headersTemp[i]];
        }
      }
    }

    if (typeof additonalHeaderReplacements !== 'undefined' && Object.keys(additonalHeaderReplacements).length > 0) {
      var headersToBeReplace = Object.keys(additonalHeaderReplacements);

      for (var i = headersTemp.length - 1; i >= 0; i--) {
        if (headersToBeReplace.indexOf(headersTemp[i]) > -1) {
          headersTemp[i] = additonalHeaderReplacements[headersTemp[i]];
        }
      }
    }

    return array_to_row(headersTemp);
  };

  schema.methods.toCSV = function(includeOnly) {
    props = find_props(schema);
    headers = find_props(schema);

    var doc = this;
    var json = doc.toJSON({ deleted : true, virtuals : true });

    function toTitleCase(str) {
      return str.replace(/[^-\s]+/g, function(word) {
        return word.replace(/^./, function(first) {
          return first.toUpperCase();
        });
      });
    }

    function trimStrings(key, value) {
      if (typeof value === 'string') {
        return value.trim();
      }

      return value;
    }

    json = JSON.stringify(json, trimStrings, null);

    json = JSON.parse(json);

    if (json.customer && json.customer.personalId) {
      json.customer.personalId = json.customer.personalId.toUpperCase();
    }
    if (json.customerAddress && json.customerAddress.cityName) {
      json.customerAddress.cityName = json.customerAddress.cityName.toUpperCase();
    }
    if (json.meteringpointAddress && json.meteringpointAddress.cityName) {
      json.meteringpointAddress.cityName = json.meteringpointAddress.cityName.toUpperCase();
    }
    if (json.additionalCustomerAddress && json.additionalCustomerAddress.cityName) {
      json.additionalCustomerAddress.cityName = json.additionalCustomerAddress.cityName.toUpperCase();
    }

    if (json.customerAddress && json.customerAddress.streetName) {
      json.customerAddress.streetName = toTitleCase(json.customerAddress.streetName);
    }
    if (json.additionalCustomerAddress && json.additionalCustomerAddress.streetName) {
      json.additionalCustomerAddress.streetName = toTitleCase(json.additionalCustomerAddress.streetName);
    }
    if (json.meteringpointAddress && json.meteringpointAddress.streetName) {
      json.meteringpointAddress.streetName = toTitleCase(json.meteringpointAddress.streetName);
    }

    if (json.customer && json.customer.lastname) {
      json.customer.lastname = toTitleCase(json.customer.lastname);
    }

    if (json.customer && json.customer.firstname) {
      json.customer.firstname = toTitleCase(json.customer.firstname);
    }

    if (json.customer && json.customer.mobileNumber) {
      const start = json.customer.mobileNumber.substring(0, 1);
      json.customer.mobileNumber = json.customer.mobileNumber.replace(/ /g, '')

      if (start === '0') {
        json.customer.mobileNumber = json.customer.mobileNumber.replace('0', '+358');
      }

      const newStart = json.customer.mobileNumber.substring(0, 1);

      if (newStart !== '+' && json.customer.mobileNumber.length > 1) {
        json.customer.mobileNumber = '+' + json.customer.mobileNumber;
      }
    }

    if (json.contractImportProperty3 && json.contractImportProperty3.propertyNo && json.contractImportProperty3.propertyNo.toString() === '37') {
      json.contractImportProperty3.customPropertyNy = '1';

      if (json.contractImportProperty3.propertyValueNo && json.contractImportProperty3.propertyValueNo.toString() === '0') {
        json.contractImportProperty3.propertyValueNo = '7';
      }
    }

    if (
      (json.additionalCustomerAddress && json.additionalCustomerAddress.streetName && json.additionalCustomerAddress.streetName.length > 0) ||
      (json.additionalCustomerAddress && json.additionalCustomerAddress.postOfficeBox && json.additionalCustomerAddress.postOfficeBox.length > 0)
    ) {
      json.customerAddress.addressType = '';
      json.customerAddress.streetName = '';
      json.customerAddress.houseNumber = '';
      json.customerAddress.houseLetter = '';
      json.customerAddress.residence = '';
      json.customerAddress.zipCode = '';
      json.customerAddress.cityName = '';
      json.customerAddress.careOf = '';
      json.customerAddress.countryCode = '';
      json.customerAddress.postOfficeBox = '';
      json.customerAddress.addressExtra = '';
      json.customerAddress.fromDate = '';
      json.customerAddress.toDate = '';
    }

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

    props = find_props(schema);
    headers = find_props(schema);

    // write header
    stream.write(this.model.csv_header(includeOnly, additonalHeaderReplacements));

    //  handle Mongoose >= 4.5
    var cursor = this.cursor ? this.cursor() : this.stream();

    // write data
    return cursor
      .pipe(mapstream(function(data, cb) {
        setTimeout( function() {
          cb(null, data.toCSV(includeOnly));
        }, 0);
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
      if (node.name === '__v') return false;
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
