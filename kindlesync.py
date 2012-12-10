from flask import Flask, redirect, url_for, request, session
import oauth2
from urllib import urlencode
from pprint import pprint

from config import config
from goodreads import GoodReads
from webreader import WebReader,Amazon

app = Flask(__name__)
app.secret_key = 'kindlesync'

def sync(token):
    webreader = WebReader()
    amazon = Amazon()
    goodreads = GoodReads()

    webreader.init()
    webreader.signin()
    webreader.get_device_token()

    owned_content = webreader.get_owned_content()
    for asin, content in owned_content.iteritems():
        book = dict(title=content['title'])
        book.update(
                webreader.get_book_userdata(asin))
        if 'metadata_url' not in book:
            continue
        book.update(
                amazon.get_book_attributes(asin))
        book.update(
                webreader.get_book_metadata(asin, book['metadata_url']))
        book['grid'] = GoodReads.isbn_to_id(book['isbn'])

        if 'pos' not in book or 'start' not in book or 'end' not in book:
            continue

        book['percent'] = \
            100. * (book['pos'] - book['start']) / (book['end'] - book['start'])
        book['page'] = int(book['percent'] * book['num_pages'])

        pprint(book)

        if book['percent'] >= 100:
            goodreads.update_as_done(token, book)
        else:
            goodreads.update_as_reading(token, book)

@app.route('/login/authorized')
def goodreads_authorized():
    print request.args['oauth_token']

    sync(session['oauth_token'])

    return "Ok"

@app.route('/login')
def login():
    access_token = GoodReads().get_access_token()
    session['oauth_token'] = oauth2.Token(access_token['oauth_token'],
                                          access_token['oauth_token_secret'])
    return redirect('http://www.goodreads.com/oauth/authorize?%s' % 
        urlencode({
            'oauth_callback' : url_for('goodreads_authorized',_external=True),
            'oauth_token' : access_token['oauth_token']
        }))

@app.route('/')
def index():
    return redirect(url_for('login'))

if __name__ == '__main__':
    config.read('auth.ini')
    app.run(debug=True)

