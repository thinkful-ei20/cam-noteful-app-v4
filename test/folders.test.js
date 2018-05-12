'use strict';
const app = require('../server');
const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');

const { TEST_MONGODB_URI, JWT_SECRET } = require('../config');

const Folder = require('../models/folder');
const seedFolders = require('../db/seed/folders');
const User = require('../models/user');
const seedUsers = require('../db/seed/users');

const jwt = require('jsonwebtoken');

const expect = chai.expect;

chai.use(chaiHttp);

describe('Noteful API - Folders', function () {
  let token;
  let user;

  before(function () {
    return mongoose.connect(TEST_MONGODB_URI)
      .then(() => mongoose.connection.db.dropDatabase());
  });

  beforeEach(function () {
    return Promise.all(seedUsers.map(user => User.hashPassword(user.password)))
      .then(digests => {
        seedUsers.forEach((user, i) => user.password = digests[i]);
        return Promise.all([
          User.insertMany(seedUsers),
          Folder.insertMany(seedFolders),
          Folder.createIndexes()
        ]);
      })
      .then(([users]) => {
        user = users[0];
        token = jwt.sign({ user }, JWT_SECRET, { subject: user.username });
      });
  });

  afterEach(function () {
    return mongoose.connection.db.dropDatabase();
  });

  after(function () {
    return mongoose.disconnect();
  });

  describe('GET /api/folders', function () {

    it('should return the correct number of folders', function () {
      const dbPromise = Folder.find({ userId: user.id });
      const apiPromise = chai.request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${token}`);
     
      return Promise.all([ dbPromise, apiPromise ])
        .then(([data, res]) => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('array');
        });
    });

    it('should return a list with the correct right fields', function () {
      const dbPromise = Folder.find({ userId: user.id });
      const apiPromise = chai.request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${token}`);

      return Promise.all([ dbPromise, apiPromise ])
        .then(([data, res]) => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('array');
          expect(res.body).to.have.length(data.length);
          res.body.forEach(function (item) {
            expect(item).to.be.a('object');
            expect(item).to.have.keys('id', 'userId', 'name', 'createdAt', 'updatedAt');
          });
        });
    });

  });

  describe('GET /api/folders/:id', function () {

    it('should return correct folder', function () {
      let data;
      return Folder.findOne().select('id name userId')
        .then(_data => {
          data = _data;
          return chai.request(app)
            .get(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then((res) => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;

          expect(res.body).to.be.an('object');
          expect(res.body).to.have.keys('id', 'userId', 'name', 'createdAt', 'updatedAt');

          expect(res.body.id).to.equal(data.id);
          expect(res.body.name).to.equal(data.name);
        });
    });

    it('should respond with a 400 for an invalid ID', function () {
      const badId = '99-99-99';

      return chai.request(app)
        .get(`/api/folders/${badId}`)
        .set('Authorization', `Bearer ${token}`)
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res.body.message).to.eq('The `id` is not valid');
        });
    });

    it('should respond with a 404 for non-existant id', function () {

      return chai.request(app)
        .get('/api/folders/AAAAAAAAAAAAAAAAAAAAAAAA')
        .set('Authorization', `Bearer ${token}`)
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(404);
        });
    });

  });

  describe('POST /api/folders', function () {

    it('should create and return a new item when provided valid data', function () {
      const newItem = {
        'name': 'newFolder',
      };
      let body;
      return chai.request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send(newItem)
        .then(function (res) {
          body = res.body;
          expect(res).to.have.status(201);
          expect(res).to.have.header('location');
          expect(res).to.be.json;
          expect(body).to.be.a('object');
          expect(body).to.include.keys('id', 'userId', 'name');
          return Folder.findById(body.id);
        })
        .then(data => {
          expect(body.id).to.equal(data.id);
          expect(body.name).to.equal(data.name);
        });
    });

    it('should return an error when missing "name" field', function () {
      const newItem = {
        'foo': 'bar'
      };

      return chai.request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send(newItem)
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Missing `name` in request body');
        });
    });

    it('should return an error when given a duplicate name', function () {

      return Folder.findOne().select('id name userId')
        .then(data => {
          const newItem = { 'name': data.name };
          return chai.request(app).post('/api/folders').set('Authorization', `Bearer ${token}`).send(newItem);
        })
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Folder name already exists');
        });
    });

  });

  describe('PUT /api/folders/:id', function () {

    it('should update the folder', function () {
      const updateItem = {
        'name': 'Updated Name'
      };
      let data;
      return Folder.findOne().select('id name userId')
        .then(_data => {
          data = _data;
          return chai.request(app)
            .put(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(updateItem);
        })
        .then(function (res) {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body).to.include.keys('id', 'userId', 'name');

          expect(res.body.id).to.equal(data.id);
          expect(res.body.name).to.equal(updateItem.name);
        });
    });

    it('should respond with a 400 for an invalid ID', function () {
      const updateItem = {
        'name': 'Blah'
      };
      const badId = '99-99-99';

      return chai.request(app)
        .put(`/api/folders/${badId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateItem)
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res.body.message).to.eq('The `id` is not valid');
        });
    });

    it('should respond with a 404 for an ID that does not exist', function () {
      const updateItem = {
        'name': 'Blah'
      };

      return chai.request(app)
        .put('/api/folders/AAAAAAAAAAAAAAAAAAAAAAAA')
        .set('Authorization', `Bearer ${token}`)
        .send(updateItem)
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(404);
        });
    });

    it('should return an error when missing "name" field', function () {
      const updateItem = {
        'foo': 'bar'
      };

      return chai.request(app)
        .put('/api/folders/9999')
        .set('Authorization', `Bearer ${token}`)
        .send(updateItem)
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Missing `name` in request body');
        });
    });

    it('should return an error when given a duplicate name', function () {

      return Folder.find().select('id name userId').limit(2)
        .then(results => {
          const [item1, item2] = results;
          item1.name = item2.name;
          return chai.request(app).put(`/api/folders/${item1.id}`).set('Authorization', `Bearer ${token}`).send(item1);
        })
        .catch(err => err.response)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Folder name already exists');
        });
    });

  });

  describe('DELETE /api/folders/:id', function () {

    it('should delete an existing document and respond with 204', function () {
      let data;
      return Folder.findOne({ userId: user.id })
        .then( _data => {
          data = _data;
          return chai.request(app)
            .delete(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then(function (res) {
          expect(res).to.have.status(204);
          return Folder.count({_id : data.id});
        })
        .then( count => {
          expect(count).to.equal(0);
        });
    });

    it('should respond with 404 when document does not exist', function () {
      return chai.request(app).delete('/api/folders/DOESNOTEXIST').set('Authorization', `Bearer ${token}`)
        .then((res) => {
          expect(res).to.have.status(204);
        });
    });

  });

});
