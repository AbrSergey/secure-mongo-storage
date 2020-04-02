class PersonalDataStorageError extends Error {
  constructor(message, status = 500, code){
    super(message);
    this.name = "PersonalDataStorageError";
    this.status = status;
    this.code = code;
  }
}

//code 1 -> Record in personalDataStorage does not exists!

module.exports = PersonalDataStorageError;
