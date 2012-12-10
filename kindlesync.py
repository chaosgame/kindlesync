import oauth2
from flask import Flask, redirect, url_for, request, session
from flask.ext.sqlalchemy import SQLAlchemy
from sqlalchemy.orm.exc import NoResultFound
from urllib import urlencode
from datetime import datetime
from pprint import pprint

from config import config
from goodreads import GoodReads
from webreader import WebReader, Amazon

app = Flask(__name__)
app.secret_key = 'kindlesync'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///kindlesync.db'
db = SQLAlchemy(app)

class StaticBookData(db.Model):
    __tablename__ = 'book'

    book_id = db.Column(db.Integer, primary_key=True)
    asin = db.Column(db.String, index=True, unique=True, nullable=False)
    grid = db.Column(db.String, nullable=False)
    isbn = db.Column(db.String, nullable=False)
    length = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String, nullable=False)

    def __init__(self, args):
         self.asin = args['asin']
         self.grid = args['grid']
         self.isbn = args['isbn']
         self.length = args['length']
         self.title = args['title']

    def update(self, book_struct):
        book_struct['asin'] = self.asin
        book_struct['grid'] = self.grid
        book_struct['isbn'] = self.isbn
        book_struct['length'] = self.length
        book_struct['title'] = self.title

class BookProgressData(db.Model):
    __tablename__ = 'book_progress'

    progress_id = db.Column(db.Integer, primary_key=True)
    user = db.Column(db.Integer, db.ForeignKey('user.user_id'))
    book = db.Column(db.Integer, db.ForeignKey('book.book_id'), nullable=False)
    sync_time = db.Column(db.DateTime, nullable=False)

    def __init__(self, user, static_book, sync_time):
        self.user = user
        self.static_book = static_book
        self.sync_time = sync_time

class User(db.Model):
    __tablename__ = 'user'

    user_id = db.Column(db.Integer, primary_key=True)
    azsession_id = db.Column(db.String)
    graccess_token = db.Column(
            db.String, index=True, unique=True, nullable=False)
    graccess_token_secret = db.Column(db.String, nullable=False)
    sync_time = db.Column(db.DateTime, nullable=False)

    def __init__(self, access_token):
        azsession_id = ''
        graccess_token = access_token['oauth_token']
        graccess_token_secret = access_token['oauth_token_secret']
        sync_time = datetime.utcfromtimestamp(0)

class KindleSync(object):
    def __init__(self):
        self.amazon = Amazon()
        self.webreader = WebReader()
        self.goodreads = GoodReads()

    def init(self, token):
        self.webreader.init()
        self.webreader.signin()
        self.webreader.get_device_token()
        self.token = token

    def load_static_book_data(self, book):
        if 'fragments_url' not in book:
            print 'fragments_url doesn\'t exit for "%s"' % book['title']
            return -1
        book.update(
                self.amazon.get_book_attributes(book['asin']))
        book['length'] = \
                self.webreader.get_book_length(book['asin'], book['fragments_url'])

        if 'isbn' not in book:
            print 'isbn doesn\'t exit for "%s"' % book['title']
            return -1

        book['grid'] = GoodReads.isbn_to_id(book['isbn'])

        if 'pos' not in book or 'length' not in book:
            print 'location data doesn\'t exit for "%s"' % book['title']
            return -1

        book['percent'] = 100. * book['pos'] / book['length']

        return 0

    def sync(self):
        user = User.query.filter_by(graccess_token=self.token).one()

        owned_content = self.webreader.get_owned_content()
        for asin, content in owned_content.iteritems():
            book = {
                    'title' : content['title'],
                    'asin' : asin,
                    }
            book.update(
                    self.webreader.get_book_userdata(asin))

            try:
                static_book = StaticBookData.query.filter_by(asin=asin).one()
                static_book.update(book)
            except NoResultFound:
                if self.load_static_book_data(book) < 0:
                    continue
                static_book = StaticBookData(book)
                db.session.add(static_book)

            if book['sync_time'] < user.sync_time:
                continue

            db.session.add(
                    BookProgressData(user, static_book, book['sync_time']))

            if book['percent'] >= 100:
                self.goodreads.update_as_done(self.token, book)
            else:
                self.goodreads.update_as_reading(self.token, book)
        db.session.commit()

@app.route('/goodreads/authorized')
def goodreads_authorized():
    kindlesync = KindleSync()
    kindlesync.init(session['oauth_token'])

    kindlesync.sync()
    return "Ok"

@app.route('/goodreads/login')
def goodreads_login():
    access_token = GoodReads().get_access_token()
    db.session.add(User(access_token))
    db.session.commit()
    return redirect('http://www.goodreads.com/oauth/authorize?%s' % 
        urlencode({
            'oauth_callback' : url_for('goodreads_authorized',_external=True),
            'oauth_token' : access_token['oauth_token']
        }))

@app.route('/')
def index():
    return redirect(url_for('goodreads_login'))

if __name__ == '__main__':
    config.read('auth.ini')
    db.create_all()
    app.run(debug=True)

