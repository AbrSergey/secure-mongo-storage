const { mongoose } = require("./connect");
const Encryption = require("./encryption")
const WIndex = require("./sseIndex");
const { matchKeys, generateOpenKeys, generateSecureKeys, generateValidationScheme, unique } = require("./helpers");
const PersonalDataStorageError = require("./PersonalDataStorageError");

class Engine {

  constructor(secret){
    this.encryptor = new Encryption(secret);
    this.wIndex = new WIndex(secret);
    this.validate_schema; //object
    this.open_keys; //array of keys
    this.secure_keys; //array of keys
    this.model;
    this.search = {}; // undefined || "entire" || "word" || "nosearch"
  }

  _checkSignature(obj) {
    let objVerify = {
      _id: obj._id,
      createdBy: obj.createdBy,
      updatedBy: obj.updatedBy
    };
    Object.keys(this.validate_schema).forEach(key => {
      if (obj[key]) objVerify[key] = obj[key]
    });
  
    if (!this.encryptor.verifySignature(objVerify, obj.signature))
      throw new PersonalDataStorageError(`Verify signature failed id = ${obj._id}!`);
  }

  _encryptSecureFields(keys, data, initIv){
    let object = {};
    keys.forEach(key => {
      const iv = parseInt((initIv).toString().slice(0, 16), 16) + this.secure_keys.indexOf(key);
      object[key] = data[key] ? this.encryptor.encryptData(data[key], String(iv)) : undefined;
    });
    return object;
  }

  _decryptSecureFields(data){
    let resObj = {};
    this.secure_keys.forEach((key, index) => {
      const iv = parseInt((data._id).toString().slice(0, 16), 16) + index;
      resObj[key] = data[key] ? this.encryptor.decryptData(data[key], String(iv)) : undefined;
    });
    return resObj;
  }

  _keyValueOpenSchema(object){
    let openPart = {};
    this.open_keys.forEach(key => openPart[key] = object[key]);
    return openPart;
  }

  _updateOpenData(objectFromDb, newData){
    let resObject = {};
    this.open_keys.forEach(key => {
      if (objectFromDb[key]) resObject[key] = objectFromDb[key];
    });
    this.open_keys.forEach(key => {
      if (Object.keys(newData).includes(key)) resObject[key] = newData[key];
    });
    return resObject;
  }

  _updateSecureData(objectFromDb, newData){
    let resObject = {};
    this.secure_keys.forEach(key => {
      if (objectFromDb[key]) resObject[key] = objectFromDb[key];
    });
    this.secure_keys.forEach(key => {
      if (Object.keys(newData).includes(key)) resObject[key] = newData[key];
    });
    return resObject;
  }


  async _createEIndex(object, data){
    let promises = [];
    Object.keys(this.search).forEach(async key => {
      promises.push(new Promise (async (resolve) => {
        if (this.search[key] === "entire"){
          promises.push(object[`${key}_eindex`] = this.encryptor.createIndexForEntireSearch(data[key]));
          resolve();
        } else resolve();
      }));
    });
    return await Promise.all(promises);
  }

  async _updateWIndex(data, id, opts){
    const tmp = [];
    Object.keys(data).forEach(async key => {
      tmp.push(new Promise( async resolve => {
        if (this.search[key] === "word"){
          let promises = [];
          unique(data[key].split(" ")).forEach(word => promises.push(this.wIndex.AddAs(word, id, key, opts)));
          const arrAsId = await Promise.all(promises);
    
          let objAsId;
          arrAsId.map(obj => objAsId = {...objAsId, ...obj});
    
          await this.wIndex.AddAd(id, objAsId, key, opts);
          resolve();
        } else resolve();
      }));
    });
    await Promise.all(tmp);
  }

  async _deleteWIndex(fileId){
    let promises = [];
    Object.keys(this.search).forEach(async key => {
      promises.push(new Promise(async resolve => {
        if (this.search[key] === "word"){
          //??????????????
          await this.wIndex.Delete(fileId, key);
          resolve();
        } else resolve();
      }))
    });
    await Promise.all(promises);
  }

  async setIndexSettings(schema, opts){
    Object.keys(schema).forEach(key => {
      if (schema[key].security) {
        this.search[key] = schema[key].search && (schema[key].search === "entire" || schema[key].search === "word") ? schema[key].search : "nosearch";
      }
    });
  
    let promises = [];
    Object.keys(this.search).forEach(async key => {
      promises.push(new Promise(async resolve => {
        if (this.search[key] === "word") await this.wIndex.setWIndexSettings(key, opts);
        resolve();
      }));
    });
    await Promise.all(promises);
    return "Ok";
  }

  async generateModel(initSchema, modelName, schemaOptions){
    this.validate_schema = await generateValidationScheme(initSchema);
    this.open_keys = generateOpenKeys(initSchema);
    this.secure_keys = generateSecureKeys(initSchema);
  
    let tmp_schema = {};
    this.open_keys.forEach((item) => tmp_schema[item] = this.validate_schema[item]); //add to schema open data
    this.secure_keys.forEach((item) => tmp_schema[item] = { type: String }); //add to schema secure data
  
  
    //add index field for entire search
    this.secure_keys.forEach((item) => {
      if (initSchema[item].search === "entire"){
        tmp_schema[`${item}_eindex`] = {
          type: Buffer,
          required: true
        };
      };
    });
  
    const newSchema = new mongoose.Schema({
      ...tmp_schema,
      signature: { type: Buffer },
      createdBy: { type: String },
      updatedBy: { type: String }
    },{
      timestamps: {
        createdAt: "createdAt",
        updatedAt: "updatedAt"
      }, ...schemaOptions });
      
    this.model = mongoose.model(modelName, newSchema);
  }

  async insert(data, opts){
    if (data){
      const id = mongoose.Types.ObjectId(); //_id = iv
      let object = {
        _id: id,
        ...this._keyValueOpenSchema(data),
        ...this._encryptSecureFields(this.secure_keys, data, id),
        createdBy: data._author || "PersonalDataStorage",
        updatedBy: data._author || "PersonalDataStorage"
      };

      object.signature = this.encryptor.createSignature(object);
  
      //add eindex
      await this._createEIndex(object, data);
      await this._updateWIndex(data, id, opts);
      
      const instance = new this.model(object);
      const resp = await instance.save(opts).catch(err => {
        throw new PersonalDataStorageError(err);
      });
  
      return resp._id;
    }
    throw new PersonalDataStorageError("Data is undefined");
  }

  async update(id, data, opts = {}){
    if (id && data){
      const [ object ] = await this.model.find({ _id: id }).exec().catch(err => {
        throw new PersonalDataStorageError(err);
      });
  
      if (!object) throw new PersonalDataStorageError("Record in personalDataStorage does not exists!", 500, 1);
      await this._checkSignature(object);

      const updatedSecureData = this._updateSecureData(this._decryptSecureFields(object), data);
      let resObject = {
        _id: object._id,
        ...this._updateOpenData(object, data),
        ...this._encryptSecureFields(matchKeys(this.secure_keys, updatedSecureData), updatedSecureData, object._id),
        createdBy: data._author || "PersonalDataStorage",
        updatedBy: data._author || "PersonalDataStorage"
      };

      resObject.signature = this.encryptor.createSignature(resObject);

      //add eindex
      await this._createEIndex(resObject, data);

      opts.useFindAndModify = false;
      const resp = await this.model.findOneAndUpdate({ _id: id }, resObject, opts).catch(err =>{
        throw new PersonalDataStorageError(err);
      });
  
      return resp._id;
    }
    else throw new PersonalDataStorageError("id || data is undefined");
  }

  async getDataByID(id){
    const [ object ] = await this.model.find({ _id: id }).exec().catch(err => {
      throw new PersonalDataStorageError(err);
    });
  
    if (!object) throw new PersonalDataStorageError("Data in personalDataStorage not exists by this id!");
    await this._checkSignature(object);
    
    return {
      ...this._keyValueOpenSchema(object),
      ...this._decryptSecureFields(object),
      createdAt: object.createdAt,
      updatedAt: object.updatedAt
    }
  }

  async find(key, value){
    //search in open data
    if (this.search[key] === undefined) {
      const objects = await this.model.find({ [key]: value }).exec().catch(err => {
        throw new PersonalDataStorageError(err);
      });
  
      let result = [];
      objects.forEach(async object => {
        // if (!object) throw new PersonalDataStorageError(`Data in personalDataStorage not exists by ${key}`);
        await this._checkSignature(object);
        
        result.push({
          id: object._id,
          ...this._keyValueOpenSchema(object),
          ...this._decryptSecureFields(object),
          createdAt: object.createdAt,
          updatedAt: object.updatedAt
        });
      });
  
      return result;
    }
    else if (this.search[key] === "entire"){
      let obj = {};
      obj[`${key}_eindex`] = await this.encryptor.createIndexForEntireSearch(value)
  
      const objects = await this.model.find(obj).exec().catch(err => {
        throw new PersonalDataStorageError(err);
      });
  
      let result = [];
      objects.forEach(async object => {
        // if (!object) throw new PersonalDataStorageError(`Data in personalDataStorage not exists by ${key}`);
        await this._checkSignature(object);
  
        result.push({
          id: object.id,
          ...this._keyValueOpenSchema(object),
          ...this._decryptSecureFields(object),
          createdAt: object.createdAt,
          updatedAt: object.updatedAt
        });
      });
  
      result.forEach((resObj, index) => {
        if (resObj[key] !== value) result.splice(index, 1);
      });
  
      return result;
    }
    else if (this.search[key] === "word"){
      return await this.wIndex.Search(value, key);
    }
  }

  async deleteById(id){
    const [ object ] = await this.model.find({ _id: id }).exec().catch(err => {
      throw new PersonalDataStorageError(err);
    });
  
    if (!object) return {};
    // await this._checkSignature(object);
    await this._deleteWIndex(id);
  
    return this.model.deleteOne({ _id: id });
  }
}

module.exports = Engine;