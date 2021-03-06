'use strict';

var express = require('express');
var imageUrl = require('../lib/image-url')('/my-scale');
var request = require('supertest');
var scale = require('..');
var getImageUrl = require('..').getImageUrl;
var sharp = require('sharp');
var should = require('should');

var app = express();
var port = app.listen().address().port;

app.use('/my-scale', scale({baseHost: 'localhost:' + port}));
app.use('/images', express.static('test/images'));
app.get('/error', function(req, res) {
  res.sendStatus(500);
});
app.get('/invalid-image', function(req, res) {
  return res.send('invalid image');
});

describe('GET /my-scale/resize', function() {
  it('should respond with 404', function(done) {
    request(app).get('/my-scale/resize').expect(404, done);
  });

  it('should respond with 400', function(done) {
    request(app).get('/my-scale/resize/100').expect(400, done);
  });

  it('should respond with 400', function(done) {
    request(app)
      .get('/my-scale/resize/100a?url=/whatever')
      .expect(400, done);
  });

  it('should respond with original image', function(done) {
    request(app)
      .get('/images/a.jpg')
      .expect('Content-Length', '1970087')
      .expect(200, done);
  });

  it('should respond with 400', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/images/a.jpg', quality: -1}))
      .expect(400, done);
  });

  it('should respond with 200', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/images/a.jpg', quality: 1}))
      .expect(200, done);
  });

  it('should respond with 400', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/images/a.jpg', quality: 101}))
      .expect(400, done);
  });

  it('should respond with 200', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/images/a.jpg', quality: 100}))
      .expect(200, done);
  });

  it('should respond with 404', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/does-not-exist'}))
      .expect(404, done);
  });

  it('should respond with 500 (backend error)', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/error'}))
      .expect(500, done);
  });

  it('should respond with 500 (sharp error)', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/invalid-image'}))
      .expect(500, done);
  });

  it('should resize /images/a.jpg to 100px', function(done) {
    request(app)
      .get(imageUrl(100, {url: '/images/a.jpg'}))
      .expect(function(res) {
        res.body.byteLength.should.be.below(5000);
        sharp(res.body).metadata(function(err, metadata) {
          metadata.width.should.be.exactly(100);
          done();
        });
      })
      .expect(200)
      .end(function(err, res) {
        if (err) {throw err;}
      });
  });

  it('should resize /images/a.jpg to 110px, 5% quality', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/a.jpg', quality: 5}))
      .expect(function(res) {
        res.body.byteLength.should.be.below(1000);
        sharp(res.body).metadata(function(err, metadata) {
          should(metadata.width).be.exactly(110)
          done();
        });
      })
      .expect(200)
      .end(function(err, res) {
        if (err) {throw err;}
      });
  });

  it('should change content type to image/png', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/a.jpg', format: 'png'}))
      .expect('Content-Type', 'image/png')
      .expect(200, done);
  });

  it('should auto detect content type png', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/b.png'}))
      .expect('Content-Type', 'image/png')
      .expect(200, done);
  });

  it('should auto detect content type jpeg', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/a.jpg'}))
      .expect('Content-Type', 'image/jpeg')
      .expect(200, done);
  });

  it('should use webp if supported', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/a.jpg'}))
      .set('Accept', 'image/webp')
      .expect('Content-Type', 'image/webp')
      .expect(200, done);
  });

  it('should crop /images/a.jpg to 55px x 42px', function(done) {
    request(app)
      .get(imageUrl(55, 42, {
        url: '/images/a.jpg',
        crop: true,
        gravity: 'west',
      }))
      .expect(function(res) {
        sharp(res.body).metadata(function(err, metadata) {
          should(metadata.width).be.exactly(55);
          should(metadata.height).be.exactly(42);
          done();
        });
      })
      .expect(200)
      .end(function(err, res) {
        if (err) {throw err;}
      });
  });

  it('should restrict crop to cropMaxSize', function(done) {
    request(app)
      .get(imageUrl(4000, 2000, {
        url: '/images/a.jpg',
        crop: true,
      }))
      .expect(function(res) {
        sharp(res.body).metadata(function(err, metadata) {
          should(metadata.width).be.exactly(2000);
          should(metadata.height).be.exactly(1000);
          done();
        });
      })
      .expect(200)
      .end(function(err, res) {
        if (err) {throw err;}
      });
  });

  it('should restrict crop to cropMaxSize', function(done) {
    request(app)
      .get(imageUrl(3000, 6000, {
        url: '/images/a.jpg',
        crop: true,
      }))
      .expect(function(res) {
        sharp(res.body).metadata(function(err, metadata) {
          should(metadata.width).be.exactly(1000);
          should(metadata.height).be.exactly(2000);
          done();
        });
      })
      .expect(200)
      .end(function(err, res) {
        if (err) {throw err;}
      });
  });

  it('should respond with 400 with wrong gravity', function(done) {
    request(app)
      .get(imageUrl(100, 100, {
        url: '/images/a.jpg',
        crop: true,
        gravity: 'easter',
      }))
      .expect(400, done);
  });

  it('should contain ETag header', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/a.jpg'}))
      .expect('ETag', /W\/".*"/)
      .expect(200, done);
  });

  it('should use If-None-Match header', function(done) {
    request(app)
      .get(imageUrl(110, {url: '/images/a.jpg'}))
      .set('If-None-Match', 'W/"5-7bbHFhm08wpZmpqEvZMZmEgN7IE"')
      .expect(function(res) {
        res.body.should.be.empty();
      })
      .expect(304, done);
  });

  it('should generate the correct image URL without protocol', function() {

    should(getImageUrl('domain.com', '/imageXY'))
      .be.exactly('http://domain.com/imageXY');
  });

  it('should generate the correct image URL with http', function() {
    should(getImageUrl('http://domain.com', '/imageXY'))
      .be.exactly('http://domain.com/imageXY');
  });

  it('should generate the correct image URL with https', function() {
    should(getImageUrl('https://domain.com', '/imageXY'))
      .be.exactly('https://domain.com/imageXY');
  });

  // it('should respond with progressive image', function(done) {
  //   request(app)
  //     .get(imageUrl(110, {url: '/images/a.jpg', progressive: true}))
  //     .expect(function(res) {
  //       sharp(res.body).metadata(function(err, metadata) {
  //         // should(metadata.width).be.exactly(110)
  //         done();
  //       });
  //     })
  //     .expect(200)
  //     .end(function(err, res) {
  //       if (err) {throw err;}
  //     });
  // });
});
