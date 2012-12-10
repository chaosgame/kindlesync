from base64 import b64encode, b64decode
import xxtea
from binascii import crc32

class Metadata1(object):
    AMAZON_KEY = \
        xxtea.longs2str([4169969034, 4087877101, 1706678977, 3681020276])

    @classmethod
    def encode(cls, metadata):
        checksum = hex(crc32(metadata) & 0xffffffff).split('x')[1].upper()
        return b64encode(
                xxtea.encrypt(
                    '%s#%s' % (checksum, metadata),
                    cls.AMAZON_KEY, False))

    @classmethod
    def decode(cls, metadata):
        return xxtea.decrypt(
                b64decode(metadata),
                cls.AMAZON_KEY, False).split('#')[1]

if __name__ == '__main__':
    encoded = "bUhfdsaHnkKpx3w6yU/jITSQC6W/EEjzhqu2QKxyJ9/JF+TLKICBl/VlsSTNwaVJCb4utBJUY8w8yRxy3P3uwhDqnah3ZCVsz79U3M/kYD7aIyhB9x4GB4qXgzvhtgh/rcF+vWVi4vFa3kLr8G5CjAfYgcS3V7fRe2p9q/MqcjdEVldPCO9PuGGRAVgN2PkBlrFaPRxH9k7gh88Laro5Vc4MgWiRwE1rJIE9ulvvBFEzoNfMYVJKv3398emYHgHPYY3OupI7TQu4Z44cbFv7g9wFK5zR6rSuLk8Sc5A6pyTnYuuf548LVtczgMhkSTSq08kiI6qyn4yj1a66m9pKCykn2joLWmaspKOqO9XFjFMB5WLU6eThu4PvugEjmGL16FUqpdO3lMp4p+jdHm04fnVjdf5V3zNIQqysdz9cjGOdIS3252lCxJyFy/bL0Kddl0E0oL06NZnKZbvoHe9y2//WRbhZNkMDE3GxW+zQ/MoEOgwTfLp8n/REk8F5SPLJUSFKYT0BOUiS6eEpGw/9wnmcHRapW5mTDggjcGZZiVUqUmU4jsM63eKWeELHBj0bh+pkTH1TK2TRIaxA5H70ShqGiMEViW+67Ad1zv1U2J72HGgTzlhWFa6j3eqhA2XAURWcvBYZ4ayplpvtL5ss5HbvpyrjEPbOauSTmbtGomcen81CIbnwANPanjcGlRCAmASWKq76ETGPuKk3o1yuVvWzSk8ehEQolXztYjdReTy9O0SgbZeRYl0zRBB6Mrua47xiCku1ZI2l/3cD3++NZjjDd3IipOXayceTrJ9XAAbaf+4WLtk6Z+ibJfHBJhRA3z0dQqHksjfKbOf3H/hKSjP5jlKGZxXgRiAXOcuZw+Y8SYB8ILXCd+Bwz7S66AJiqguy0eNl7m6rGKYAce8CKFGquZmaljMbw00B1z5BXYnEueOUPXUEWUoiFNJFIM6E8W9Uo0RMwvb+4FsUGkTfrgLhqox/009EswvdUnroSNU="

    decoded = Metadata1.decode(encoded)
    assert(encoded == Metadata1.encode(decoded))
    print decoded

