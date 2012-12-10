from urllib import urlencode
import urllib2
import mechanize
import cookielib
import re
import json
import bottlenose
from lxml import etree

from config import config

class WebReader(mechanize.Browser):
    CHROME_USERAGENT = \
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_5) ' + \
        'AppleWebKit/537.11 (KHTML, like Gecko) ' + \
        'Chrome/23.0.1271.64 Safari/537.11'
    OPENID_REFER = {
        'openid.assoc_handle' : 'amzn_kweb',
        'openid.return_to' : 'https://www.amazon.com/',
        'openid.mode' : 'checkid_setup',
        'openid.ns' : 'http://specs.openid.net/auth/2.0',
        'openid.identity' : 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id' : 'http://specs.openid.net/auth/2.0/identifier_select',
        }

    def init(self):
        self.cookiejar = cookielib.CookieJar()
        self.set_cookiejar(self.cookiejar)
        self.set_handle_robots(False)
        self.addheaders = [('User-Agent', WebReader.CHROME_USERAGENT)]

    def signin(self):
        url = '%s?%s' % ('https://www.amazon.com/ap/signin',
                urlencode(WebReader.OPENID_REFER))
        resp = self.open(url)

        resp.set_data(re.sub('<!DOCTYPE(.*)>', '', resp.get_data()))
        self.set_response(resp)

        self.select_form(name='signIn')
        self.set_all_readonly(False)
        self['email'] = config.get('webreader', 'email')
        self['password'] = config.get('webreader', 'password')
        resp = self.submit()

    def get_device_token(self):
        cookies = dict([(c.name, c.value) for c in self.cookiejar])

        # Device Type is a magic string
        self.addheaders.append(('x-amzn-sessionid', cookies['session-id']))
        resp = self.open(
                'https://read.amazon.com/service/web/register/getDeviceToken?%s' %
                urlencode({
                    'serialNumber' : 'A2CTZ977SKFQZY',
                    'deviceType' : 'A2CTZ977SKFQZY'
                    }))

        device_token = json.load(resp)

        self.addheaders.append(('X-ADP-Session-Token', device_token['deviceSessionToken']))

        return device_token['deviceSessionToken']

    def get_owned_content(self):
        resp = self.open('https://read.amazon.com/service/web/reader/getOwnedContent')
        return json.load(resp)['asinsToAdd']

    def get_book_userdata(self, asin):
        resp = self.open(
                'https://read.amazon.com/service/web/reader/startReading?%s' %
                urlencode({
                    'asin' : asin,
                    'isSample' : 'false',
                    'clientVersion' : '10403026'
                    }))

        userdata = json.load(resp)
        metadata_url = userdata['metadataUrl']

        if 'metadataUrl' not in userdata or \
           'lastPageReadData' not in userdata:
            return {}

        last_page_read = userdata['lastPageReadData']

        if 'position' not in last_page_read or \
           'syncTime' not in last_page_read:
            return {}

        return {
            'metadata_url' : userdata['metadataUrl'],
            'pos' : int(last_page_read['position']),
            'sync_time' : last_page_read['syncTime'],
            }

    def get_book_metadata(self, asin, metadata_url):
        resp = self.open(metadata_url)
        match = re.search('{.*}', resp.read())
        metadata = json.loads(match.group(0))

        if 'startPosition' not in metadata or \
           'endPosition' not in metadata:
               return {}

        return {
                'start' : int(metadata['startPosition']),
                'end' : int(metadata['endPosition']),
                }

class Amazon(bottlenose.Amazon):
    def __init__(self):
        super(Amazon, self).__init__(
            config.get('amazon','key'),
            config.get('amazon','secret'),
            config.get('amazon','assoctag'))

    def get_book_attributes(self, asin):
        attributes = etree.fromstring(
                self.ItemLookup(ItemId=asin, ResponseGroup='ItemAttributes'))

        namespace = attributes.nsmap[None]

        isbn = attributes.findtext(
                './/{%s}EISBN' % namespace)
        num_pages = int(attributes.findtext(
                './/{%s}NumberOfPages' % namespace))

        return {
            'isbn' : isbn,
            'num_pages' : num_pages,
            }

if __name__ == '__main__':
    config.read(['auth.ini'])
    webreader = WebReader()
    amazon = Amazon()

    webreader.init()
    webreader.signin()
    webreader.get_device_token()

    books = {}
    owned_content = webreader.get_owned_content()
    for asin, content in owned_content.iteritems():
        book = dict(title=content['title'])
        book.update(
                amazon.get_book_attributes(asin))
        book.update(
                webreader.get_book_userdata(asin))
        if 'metadata_url' in book:
            book.update(
                    webreader.get_book_metadata(asin, book['metadata_url']))
        books[asin] = book

    from pprint import pprint
    pprint(books)

