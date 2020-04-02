const PersonalDataStorageError = require("./PersonalDataStorageError");

const filterObjectBySecurityValue = (object, value) => {
  const columns = Object.keys(object).map(column => {
    if (value === false && !object[column]["security"]) return column;
    else return object[column]["security"] === value ? column : undefined;
  });
  return columns.filter(item => item);
};

module.exports.deleteUndefinedKey = (obj) => {
  Object.keys(obj).forEach(key => obj[key] === undefined ? delete obj[key] : "");
},

module.exports.sortObject = (o) => {
  return Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
};

module.exports.unique = (a) => {
  return [ ...new Set(a)];
};

//b = key
module.exports.xor = (a, b) => {
  if (!Buffer.isBuffer(a)) a = new Buffer.from(a)
  if (!Buffer.isBuffer(b)) b = new Buffer.from(b)
  let res = [];
  if (a.length > b.length) {
    for (let i = 0, tmp = a.length / b.length; i < tmp; i++)
      for (let j = 0, k = i*b.length + j; j < b.length && k < a.length; j++, k++){
        res.push(a[k] ^ b[j])
      }
  } else {
  for (let i = 0; i < a.length; i++)
    res.push(a[i] ^ b[i]);
  }
  return new Buffer.from(res);
}

module.exports.matchKeys = (arr, obj) => {
  let arrKeys = [];
  arr.forEach(key => {
    if (Object.keys(obj).includes(key)) arrKeys.push(key);
  });
  return arrKeys;
};

module.exports.generateValidationScheme = async (initSchema) => {
  const validateScheme = {};
  Object.keys(initSchema).forEach(key => {
    if (!initSchema[key].validation) throw new PersonalDataStorageError(`Validation property doesn't exists for ${key}`);
    validateScheme[key] = initSchema[key].validation;
  });
  return { ...validateScheme };
};

module.exports.generateOpenKeys = (initSchema) => filterObjectBySecurityValue(initSchema, false);
module.exports.generateSecureKeys = (initSchema) => filterObjectBySecurityValue(initSchema, true);