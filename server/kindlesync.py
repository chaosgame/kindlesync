import oauth2
from flask import Flask, redirect, url_for, request, session
from flask.ext.sqlalchemy import SQLAlchemy
from sqlalchemy.orm.exc import NoResultFound
from datetime import datetime
from urllib import urlencode
from urlparse import parse_qsl
from ConfigParser import ConfigParser

import requests
from lxml import etree
from bottlenose import Amazon

OAUTH2_HEADERS = {'content-type': 'application/x-www-form-urlencoded'}

app = Flask(__name__)
app.secret_key = 'kindlesync'
app.config.from_pyfile('auth.cfg')
# db = SQLAlchemy(app)

def asin_to_grid(asin):
    # TODO(nathan) memoize this
    amazon = Amazon(
        app.config['AMAZON_KEY'],
        app.config['AMAZON_SECRET'],
        app.config['AMAZON_ASSOCTAG'])

    attributes = etree.fromstring(
        amazon.ItemLookup(
            ItemId=asin,
            ResponseGroup='ItemAttributes'))
    namespace = attributes.nsmap[None]
    isbn = attributes.findtext(
            './/{%s}EISBN' % namespace)

    resp = requests.get(
        'http://www.goodreads.com/book/isbn_to_id',
        params={
            'key' : app.config['GOODREADS_KEY'],
            'isbn' : isbn,
            })

    return resp.text

@app.route('/update/<asin>/done')
def update_done(asin):
    client = oauth2.Client(
        oauth2.Consumer(
            key=app.config['GOODREADS_KEY'],
            secret=app.config['GOODREADS_SECRET']),
        session['access_token'])

    body = urlencode({
            'name' : 'read',
            'book_id' : asin_to_grid(asin),
            })
    response, content = client.request(
            'http://www.goodreads.com/shelf/add_to_shelf.xml',
            'POST', body, OAUTH2_HEADERS)

    return content

@app.route('/update/<asin>/progress/<float:percent>')
def update_progress(asin, percent):
    client = oauth2.Client(
        oauth2.Consumer(
            key=app.config['GOODREADS_KEY'],
            secret=app.config['GOODREADS_SECRET']),
        session['access_token'])

    body = urlencode({
            'name' : 'currently-reading',
            'book_id' : asin_to_grid(asin),
            })
    response, content = client.request(
            'http://www.goodreads.com/shelf/add_to_shelf.xml',
            'POST', body, OAUTH2_HEADERS)

    body = urlencode({
                'user_status[book_id]' : asin_to_grid(asin),
                'user_status[percent]' : percent,
                })
    response, content = client.request(
            'http://www.goodreads.com/user_status.xml',
            'POST', body, OAUTH2_HEADERS)

    return content

@app.route('/authorized')
def authorized():
    return "Ok"

@app.route('/login')
def login():
    client = oauth2.Client(
        oauth2.Consumer(
            key=app.config['GOODREADS_KEY'],
            secret=app.config['GOODREADS_SECRET']))

    response, content = \
        client.request('http://www.goodreads.com/oauth/request_token', 'GET')

    if response['status'] != '200':
        abort(response['status'])

    access_token = dict(parse_qsl(content))

    session['access_token'] = oauth2.Token(
            access_token['oauth_token'],
            access_token['oauth_token_secret'])

    return redirect('http://www.goodreads.com/oauth/authorize?' +
        urlencode({
            'oauth_callback' : url_for('authorized', _external=True),
            'oauth_token' : access_token['oauth_token']
        }))

@app.route('/')
def index():
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True)

