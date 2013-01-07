import oauth2
import requests
from urlparse import parse_qsl
from urllib import urlencode

from config import config

class GoodReads(oauth2.Consumer):
    def __init__(self):
        super(GoodReads,self).__init__(
                key=config.get('goodreads', 'key'),
                secret=config.get('goodreads', 'secret'))

    def get_access_token(self):
        client = oauth2.Client(self)

        response, content = \
            client.request('http://www.goodreads.com/oauth/request_token', 'GET')

        if response['status'] != '200':
            raise Exception('Invalid response: %s' % response['status'])

        return dict(parse_qsl(content))

    @classmethod
    def isbn_to_id(cls, isbn):
        resp = requests.get(
                'http://www.goodreads.com/book/isbn_to_id',
                params={
                    'key' : config.get('goodreads','key'),
                    'isbn' : isbn,
                    })

        return resp.text

    def update_as_done(self, token, book):
        client = oauth2.Client(self, token)
        headers = {'content-type': 'application/x-www-form-urlencoded'}
        body = urlencode({
                    'name' : 'read',
                    'book_id' : book['grid'],
                    })
        response, content = client.request(
                'http://www.goodreads.com/shelf/add_to_shelf.xml',
                'POST', body, headers)

    def update_as_reading(self, token, book):
        client = oauth2.Client(self, token)
        headers = {'content-type': 'application/x-www-form-urlencoded'}
        body = urlencode({
                    'name' : 'currently-reading',
                    'book_id' : book['grid'],
                    })
        response, content = client.request(
                'http://www.goodreads.com/shelf/add_to_shelf.xml',
                'POST', body, headers)

        body = urlencode({
                    'user_status[book_id]' : book['grid'],
                    'user_status[percent]' : book['percent'],
                    })
        response, content = client.request(
                'http://www.goodreads.com/user_status.xml',
                'POST', body, headers)

if __name__ == '__main__':
    config.read('auth.ini')
    print GoodReads.isbn_to_id('978-1400077427')

