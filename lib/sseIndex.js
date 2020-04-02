const { mongoose } = require("./connect");
const Encryption = require("./encryption");
const PersonalDataStorageError = require("./PersonalDataStorageError");
const { xor } = require("./helpers");
const ObjectId = require("mongoose").Types.ObjectId;

class WIndex {
  constructor(secret){
    this.encryptor = new Encryption(secret);
    this.key1 = this.encryptor.generateKey(secret, secret);
    this.key2 = this.encryptor.generateKey(this.key1, secret);
    this.key3 = this.encryptor.generateKey(this.key2, secret);
    this.indexTModel;
    this.indexAModel;
    this.word_index_id = {};
    this.opts;
    this.null = "0".repeat(24);
  }

  async _findAsIndex({ _id }, dataForXor){
    const As = await this.indexAModel.find({ _id });
    if (!dataForXor) return As[0].t;
    const t = JSON.parse(xor(As[0].t, dataForXor));
    return {
      _id: As[0]._id,
      file: t[0] !== this.null ? t[0] : 0,
      addrDn: t[1] !== this.null ? t[1] : 0,
      next: t[2] !== this.null ? t[2] : 0
    };
  }

  async _createAsIndex({ _id, file, addrDn, next }, dataForXor){
    const instance = new this.indexAModel({
      _id: _id || mongoose.Types.ObjectId(),
      t: xor(JSON.stringify([file || this.null, addrDn || this.null, next || this.null]), dataForXor)
    });
    const As = await instance.save().catch(err => {
      throw new PersonalDataStorageError(err);
    });
    return { _id: As._id };
  }

  async _updateAsIndex({ _id, file, addrDn, next }, dataForXor){
    const As = await this.indexAModel.findOneAndUpdate({ _id }, {
      t: xor(JSON.stringify([file || this.null, addrDn || this.null, next || this.null]), dataForXor)
    }).catch(err =>{
      throw new PersonalDataStorageError(err);
    });
    return {
      _id: As._id,
      addrDn: As.addrDn !== this.null ? As.addrDn : 0
    };
  }
  
  async _findAndUpdateAsIndex({ _id, file, addrDn, next }, dataForXor, update){
    let As = await this._findAsIndex({ _id }, dataForXor);
    if (!dataForXor){
      As = await this.indexAModel.findOneAndUpdate({ _id }, {
        t: xor(As, update)
      }).catch(err => {
        throw new PersonalDataStorageError(err);
      });
      return;
    }
    if (file !== undefined) As.file = file;
    if (addrDn !== undefined) As.addrDn = addrDn;
    if (next !== undefined )As.next = next;
    return await this._updateAsIndex(As, dataForXor);
  }

  async _findAdIndex({ _id }, dataForXor){
    const Ad = await this.indexAModel.find({ _id });
    if (!dataForXor) return Ad[0].t;
    const t = JSON.parse(xor(Ad[0].t, this.encryptor.H2(this.key2)));
    return {
      _id: Ad[0]._id,
      addrD_plus: t[0],
      addrNd_minus: t[1],
      addrNd_plus: t[2],
      addrN: t[3],
      addrN_minus: t[4],
      addrN_plus: t[5],
      word: t[6]
    };
  }

  async _updateAdIndex({ _id, addrD_plus, addrNd_minus, addrNd_plus, addrN, addrN_minus, addrN_plus, word }, dataForXor){
    As = await this.indexAModel.findOneAndUpdate({ _id }, {
      t: xor(JSON.stringify([ addrD_plus||this.null, addrNd_minus||this.null, addrNd_plus||this.null, addrN||this.null, addrN_minus||this.null, addrN_plus||this.null, word||this.null ]), dataForXor)
    }).catch(err =>{
      throw new PersonalDataStorageError(err);
    });
    return {
      _id: As._id,
      addrDn: As.addrDn
    };
  }

  async _findAndUpdateAdIndex({ _id, addrD_plus, addrNd_minus, addrNd_plus, addrN, addrN_minus, addrN_plus, word }, dataForXor, update){
    const Ad = await this._findAdIndex({ _id }, dataForXor);
    if (!dataForXor){
      await this.indexAModel.findOneAndUpdate({ _id }, {
        t: xor(Ad, update)
      }).catch(err => {
        throw new PersonalDataStorageError(err);
      });
      return;
    }

    if (addrD_plus !== undefined) Ad.addrD_plus = addrD_plus;
    if (addrNd_minus !== undefined) Ad.addrNd_minus = addrNd_minus;
    if (addrNd_plus !== undefined )Ad.addrNd_plus = addrNd_plus;
    if (addrN !== undefined )Ad.addrN = addrN;
    if (addrN_minus !== undefined )Ad.addrN_minus = addrN_minus;
    if (addrN_plus !== undefined )Ad.addrN_plus = addrN_plus;
    if (word !== undefined )Ad.word = word;
    return await this._updateAdIndex(Ad, dataForXor);
  }

  async _findOneAndRemoveAdIndex({ _id }, dataForXor){
    const Ad = await this.indexAModel.findOneAndRemove({ _id }).catch(err =>{
      throw new PersonalDataStorageError(err);
    });
    const t = JSON.parse(xor(String(Ad.t), dataForXor));
    return {
      _id: Ad._id,
      addrD_plus: t[0],
      addrNd_minus: t[1],
      addrNd_plus: t[2],
      addrN: t[3],
      addrN_minus: t[4],
      addrN_plus: t[5],
      word: t[6]
    };
  }

  _generateDataForXorAs(word){
    return this.encryptor.H1(this.encryptor.F(word, this.key3));
  }

  _generateDataForXorAd(file){
    return this.encryptor.H2(this.encryptor.P(file, this.key3));
  }

  async setWIndexSettings(key, opts){
    const indexASchema = new mongoose.Schema({
      t: { type: Buffer }
    }, { strict: false });
    const indexTSchema = new mongoose.Schema({
      _index: mongoose.Mixed,
      s: Object,
      d: Object
     }, { strict: false });
    this.indexAModel = mongoose.model("indexA", indexASchema);
    this.indexTModel = mongoose.model("indexT", indexTSchema);
    const indexT = await this.indexTModel.find({ _index: key }).exec().catch(err => {
      throw new PersonalDataStorageError(err);
    });
  
    if (!indexT.length) {
      this.word_index_id[key] = mongoose.Types.ObjectId();
      const instance = new this.indexTModel({
        _id: this.word_index_id[key],
        _index: key,
        Ts: {}
      });
  
      await instance.save(opts).catch(err => {
        throw new PersonalDataStorageError(err);
      });
    } else {
      if (indexT.length !== 1) throw new PersonalDataStorageError(`Find more than 1 index for ${key}`);
      this.word_index_id[key] = indexT[0]._id;
    }
  }
  
  async AddAs(word, file_id, key, opts){
    this.opts = opts;
    const dataForXor = this._generateDataForXorAs(word);
    let arrAsId = [];
    const Dn_id = mongoose.Types.ObjectId();

    //проверить существует ли это слово в Ts
    const Fk1_word = this.encryptor.F(word, this.key1);
    const record_in_Ts = `s.${Fk1_word}`;
    let [ Ts ] = await this.indexTModel.aggregate([
      { $match: { _id: this.word_index_id[key], [record_in_Ts]: { $exists: true } } },
      { $project: { [record_in_Ts]: 1 } }
    ]);
    
    let As;
    //если слово не существует то добавляю запсь в коллекцию indexAs
    if (!Ts){
      As = await this._createAsIndex({
        file: file_id,
        addrDn: Dn_id,
        next: 0
      }, dataForXor);
  
      //добавляю запись в Ts
      Ts = await this.indexTModel.findOneAndUpdate({ _id: this.word_index_id[key] }, {
        $set: { [record_in_Ts]: String(xor(String(As._id), this.encryptor.G(word, this.key2))) }
      }, opts).catch(err =>{
        throw new PersonalDataStorageError(err);
      });
  
      arrAsId.push(As._id);
      return { [word]: {
        Ad_id: Dn_id,
        arrAs: arrAsId,
        As_minus : 0
      } };
    }
    else {
      As = await this._findAsIndex({ _id: String(xor(Ts.s[Fk1_word], this.encryptor.G(word, this.key2))) }, dataForXor);
      arrAsId.push(As._id);
  
      //find latest record in As
      while (As.next !== 0){
        As = await this._findAsIndex({ _id: As.next }, dataForXor);
        arrAsId.push(As._id);
      }
  
      const id = mongoose.Types.ObjectId();
      arrAsId.push(id);
      await this._createAsIndex({
        _id: id,
        file: file_id,
        addrDn: Dn_id,
        next: 0
      }, dataForXor);
  
      await this._findAndUpdateAsIndex({
        _id: As._id,
        next: id
      }, dataForXor);
  
      return { [word]: {
        Ad_id: Dn_id,
        arrAs: arrAsId,
        As_minus: As.addrDn
      }};
    }
  }

  async AddAd(fileId, objAsId, key, opts){
    fileId = String(fileId);
    const dataForXor = this._generateDataForXorAd(String(fileId));
    //создать Ad
    const arrayAdId = Object.keys(objAsId).map(key => objAsId[key].Ad_id);
    const As_minus_arr = Object.keys(objAsId).map(key => objAsId[key].As_minus);
    Object.keys(objAsId).map(key => {
      objAsId[key] = objAsId[key].arrAs
    });
  
    await Promise.all(Object.keys(objAsId).map(async (word, index) => {
      if (As_minus_arr[index]){
        return this._findAndUpdateAdIndex({
          _id: ObjectId(As_minus_arr[index]),
        }, undefined, Buffer.concat([
          new Buffer.alloc(56),
          xor(String(arrayAdId[index]), this.null),
          new Buffer.alloc(57),
          xor(String(objAsId[word][objAsId[word].length - 1]), this.null),
          new Buffer.alloc(93)
        ]))
      }
    }));
  
    const res = await Object.keys(objAsId).map((word, index) => {
      const obj = {
        addrD_plus: Object.keys(objAsId).length - 1 > index ? String(arrayAdId[index + 1]) : this.null,
        addrNd_minus: As_minus_arr[index] ? String(As_minus_arr[index]) : this.null,
        addrNd_plus: this.null,
        addrN: objAsId[word][objAsId[word].length - 1] ? String(objAsId[word][objAsId[word].length - 1]) : this.null,
        addrN_minus: objAsId[word].length > 1 ? String(objAsId[word][objAsId[word].length - 2]) : this.null,
        addrN_plus: this.null,
        word: this.encryptor.F(word, this.key1)
      };
      return {
        _id: arrayAdId[index],
        t: xor(JSON.stringify([ obj.addrD_plus, obj.addrNd_minus, obj.addrNd_plus, obj.addrN, obj.addrN_minus, obj.addrN_plus, obj.word ]), dataForXor)
      }
    });
  
    await this.indexAModel.insertMany(res).catch(err => {
      throw new PersonalDataStorageError(err);
    });
  
    //создать Td
    const Fk1_file = this.encryptor.F(fileId, this.key1);
    const record_in_Td = `d.${Fk1_file}`;  

    await this.indexTModel.findOneAndUpdate({ _id: this.word_index_id[key] }, {
      $set: { [record_in_Td]: String(xor(String(arrayAdId[0]), this.encryptor.G(fileId, this.key2))) }
    } , opts).catch(err =>{
      throw new PersonalDataStorageError(err);
    });
  }

  async Search(word, key, opts){
    //найти запись в Ts
    const dataForXor = this._generateDataForXorAs(word);
    const Fk1_word = this.encryptor.F(word, this.key1);
    const record_in_Ts = `s.${Fk1_word}`;
    let [ Ts ] = await this.indexTModel.aggregate([
      { $match: { _id: this.word_index_id[key], [record_in_Ts]: { $exists: true } } },
      { $project: { [record_in_Ts]: 1 } }
    ]);
  
    if(!Ts) return null;
    let arrId = []

    //если есть, то найти первый элемент в As
    let As = await this._findAsIndex({ _id: String(xor(Ts.s[Fk1_word], this.encryptor.G(word, this.key2))) }, dataForXor);
    arrId.push(As.file);
  
    //найти все элементы пока (next !== 0)
    while(As.next !== 0){
      As = await this._findAsIndex({ _id: As.next }, dataForXor);
      arrId.push(As.file);
    }
    return arrId;
  }

  async Delete(fileId, key){
    fileId = String(fileId);
    const dataForXor = this._generateDataForXorAd(fileId);
  
    //вычислить хэш от id file
    const Fk1_file = this.encryptor.F(fileId, this.key1);
    const record_in_Td = `d.${Fk1_file}`;
  
    const Td = await this.indexTModel.findOneAndUpdate( //TODO вернуть только нужные значение!!!!
      { _id: this.word_index_id[key] },
      { $unset: { [record_in_Td]: 1 }},
      { projection: { [record_in_Td]: 1 }}
    ).catch(err =>{
      throw new PersonalDataStorageError(err);
    });
  
    let Ad_addr = String(xor(String(Td.d[Fk1_file]), this.encryptor.G(fileId, this.key2)));
  
    while (Ad_addr !== this.null){
      let Ad = await this._findOneAndRemoveAdIndex({ _id: Ad_addr }, dataForXor);
  
      //обновить Nd_plus и N+1 в индексе Ad по адресу Nd_minus на Nd_plus и N+1
      if (Ad.addrNd_minus !== this.null){
        await this._findAndUpdateAdIndex({
          _id: Ad.addrNd_minus,
          addrNd_plus: Ad.addrNd_plus,
          addrN_plus: Ad.addrN_plus
        }, undefined, Buffer.concat([
          new Buffer.alloc(56),
          xor(Ad.addrNd_plus, String(Ad._id)),
          new Buffer.alloc(57),
          xor(Ad.addrN_plus, Ad.addrN),
          new Buffer.alloc(93)
        ]))
      }
  
      //обновить Nd_minus и N-1 в индексе Ad по адресу Nd_plus на Nd_minus и N-1
      if (Ad.addrNd_plus !== this.null){
        await this._findAndUpdateAdIndex({
          _id: Ad.addrNd_plus,
          addrNd_minus: Ad.addrNd_minus,
          addrN_minus: Ad.addrN_minus
        }, undefined, Buffer.concat([
          new Buffer.alloc(29),
          xor(Ad.addrNd_minus, String(Ad._id)),
          new Buffer.alloc(57),
          xor(Ad.addrN_minus, Ad.addrN),
          new Buffer.alloc(120)
        ]))
      }
  
      //обновить next в As по адресу N_1 на N+1
      if (Ad.addrN_minus !== this.null){
        await this._findAndUpdateAsIndex({
          _id: Ad.addrN_minus,
          next: Ad.addrN_plus
        }, undefined, Buffer.concat([ new Buffer.alloc(56), xor(Ad.addrN_plus, Ad.addrN), new Buffer.alloc(2) ]));
      }
  
      //если это первый элемент, то есть N_minus равен нулю, а N_plus не нуль, то исправить указатель в Ts на N_plus
      if (Ad.addrN_minus === this.null && Ad.addrN_plus){
        const tmp = `s.${Ad.word}`;
        const [ Ts ] = await this.indexTModel.aggregate([
          { $match: { _id: this.word_index_id[key], [tmp]: { $exists: true } } },
          { $project: { [tmp]: 1 } }
        ]);
  
        await this.indexTModel.find ({ _id: this.word_index_id[key] }).updateOne({
          $set: {
            [tmp]:  String(xor(xor(Ad.addrN_plus, Ad.addrN), String(Ts.s[Ad.word])))
          }
        });
      }
        
      if (Ad.addrN_minus === this.null && Ad.addrN_plus === this.null){
        const tmp = `s.${Ad.word}`;
        await this.indexTModel.find({ _id: this.word_index_id[key] }).updateOne({
          $unset: { [tmp]: 1 }
        });
      }
  
      let promises = []
  
      //удалить запись в As по адресу N
      promises.push(this.indexAModel.deleteOne({ _id: Ad.addrN }));
      await Promise.all(promises);
  
      //переходим к следующему слову в удаляемом файле
      Ad_addr = Ad.addrD_plus;
    }
  }
}

module.exports = WIndex;