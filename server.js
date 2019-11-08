'use strict';
require('dotenv').config();
///////////////////////////////////////////////////////////////////////
//App dependencies
///////////////////////////////////////////////////////////////////////
const superagent = require('superagent');
const cors = require('cors');
const express = require('express');
const pg = require('pg');
///////////////////////////////////////////////////////////////////////
///Initializers
///////////////////////////////////////////////////////////////////////
const PORT = process.env.PORT || 3000;
const server = express();
server.use(cors());
server.get('/location', locationHandler);
server.get('/weather', weatherHandler);
server.get('/trails', trailsHandler);
server.get('/coordinates', coordHandler);
server.get('/movies', movieHandler);
server.get('/yelp', yelpHandler);
// server.get('/add', addRow);
server.use('*', notFound);
server.use(errorHandler);
///////////////////////////////////////////////////////////////////////
// DB setup
///////////////////////////////////////////////////////////////////////
const client = new pg.Client(process.env.DATABASE_URL);
client.on('err', err => { throw err; });
server.get('/', (req, res) => {
  res.status(200).json('Yay');
});
///////////////////////////////////////////////////////////////////////
//Callback Functions
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
//Not Found
function notFound(req, res) {
  res.status(404).send('Not Found');
}
///////////////////////////////////////////////////////////////////////
//Error Handler
function errorHandler(error, req, res) {
  res.status(500).send(error);
}
///////////////////////////////////////////////////////////////////////
//Build a path to Location (lat/lng)
function locationHandler(req, res) {
  let ABC = 'SELECT * FROM locations WHERE search_query = ($1)'
  let dataValue = [req.query.data]
  client.query(ABC, dataValue).then(result => {
    // console.log('ROWWWWS', result);
    if (result.rowCount) {
      console.log('match found');
      let loc = new Location(req.query.data, result)
      res.status(200).send(loc);
    } else {
      console.log('no match found');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${req.query.data}&key=${process.env.GEOCODE_API_KEY}`;
      superagent.get(url).then(data => {
        console.log('these are the new city results: '+data.body.results[0])
        let SQL = 'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *';
        let safeValues = [req.query.data, data.body.results[0].formatted_address, data.body.results[0].geometry.location.lat, data.body.results[0].geometry.location.lng];
        client.query(SQL, safeValues);
        return new Newerlocation(safeValues)
      }).then(results => {
        res.status(200).json(results);
      })
    }
  }).catch(error => errorHandler(error, req, res));
}

function coordHandler(req, res) {
  let SQL = 'SELECT * FROM locations';
  client.query(SQL)
    .then(results => {
      res.status(200).json(results.rows);
    })
    .catch(err => console.err(err));
}
///////////////////////////////////////////////////////////////////////
//Building a path to /weather
function weatherHandler(req, res) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
  superagent.get(url).then(data => {
    const weatherSum = data.body.daily.data.map(value => {
      return new Forecast(value);
    });
    res.status(200).json(weatherSum);
  }).catch(error => errorHandler(error, req, res));
}
///////////////////////////////////////////////////////////////////////
//Build a path to Trails
function trailsHandler(req, res) {
  const url = `https://www.hikingproject.com/data/get-trails?lat=${req.query.data.latitude}&lon=${req.query.data.longitude}&key=${process.env.TRAIL_API_KEY}`
  superagent.get(url).then(data => {
    let trailData = data.body.trails.map(value => {
      return new Trail(value);
    });
    res.status(200).json(trailData);
  }).catch(error => errorHandler(error, req, res));
}
///////////////////////////////////////////////////////////////////////
//Build a path to Movies
function movieHandler(req, res) {
  const url = `https://api.themoviedb.org/3/search/movie/?api_key=${process.env.MOVIE_API_KEY}&language=en-US&page=1&query=${req.query.data}`;
  superagent.get(url).then(data => {
    const details = data.body.results.map(value => {
      return new Movie(value);
    });
    res.status(200).json(details);
  }).catch(error => errorHandler(error, req, res));
}
///////////////////////////////////////////////////////////////////////
//Build a path to yelp
function yelpHandler(req, res) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${req.query.data}`
  superagent.get(url).set('Authorization', `Bearer ${process.env.YELP_API_KEY}`).then(value => {
    const reviews = value.body.businesses.map(data => {
      return new Yelp(data);
    });
    res.status(200).json(reviews);
  }).catch(error => errorHandler(error, req, res));
}

///////////////////////////////////////////////////////////////////////
//Constructor Functions
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////
//Forecast Constructor
function Forecast(each) {
  let temp = new Date((each.time) * 1000);
  let tempScr = temp.toUTCString().slice(0, 16);
  this.forecast = each.summary;
  this.time = tempScr;
}
///////////////////////////////////////////////////////////////////////
//Location Constructor
function Location(city, geoData) {
  this.search_query = city;
  this.formatted_query = geoData.rows[0].formatted_query;
  this.latitude = geoData.rows[0].latitude;
  this.longitude = geoData.rows[0].longitude;
}

function Newerlocation(someData){
  this.search_query = someData[0];
  this.formatted_query = someData[1];
  this.latitude = someData[2];
  this.longitude = someData[3];
}
///////////////////////////////////////////////////////////////////////
//Trail Constructor
function Trail(trailData) {
  this.name = trailData.name;
  this.location = trailData.location;
  this.length = trailData.length;
  this.stars = trailData.stars;
  this.star_votes = trailData.starVotes;
  this.summary = trailData.summary;
  this.trail_url = trailData.url;
  this.conditions = `${trailData.conditionStatus}, ${trailData.conditionDetails}`
  this.condition_date = trailData.conditionDate.slice(0, 9);
  this.condition_time = trailData.conditionDate.slice(11, 18);
}
////////////////////////////////////////////////////////////////////////
//Movie Constructor
function Movie(movie) {
  this.tableName = 'movies';
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w500' + movie.poster_path;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
  this.created_at = Date.now();
}
///////////////////////////////////////////////////////////////////////////
//Yelp Constructor
function Yelp(business) {
  this.tableName = 'yelps';
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
  this.created_at = Date.now();
}
// server.listen(PORT, () => {
//   console.log(`listening on PORT ${PORT}`);
// });
client.connect()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`listening on ${PORT}`);
    })
  })
  .catch(err => {
    throw `PG startup error ${err.message}`
  })