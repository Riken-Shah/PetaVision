import configparser
import os
from io import BytesIO
from pathlib import Path, PurePosixPath
import numpy as np
import requests
from PIL import Image
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

from sync import SyncDir

config = configparser.ConfigParser()
config.read("config.ini")

IMAGES_PREFIX_URL = PurePosixPath('/images')
THUMBS_PREFIX_URL = PurePosixPath('/thumb')
MAX_TOP_N = 100
ROUND_NUM = 1_000_000


# Helper functions
def round_float(x):
    return float(x)


def emb_to_list(emb):
    if emb.ndim == 2:
        assert emb.shape[0] == 1, 'Multidimension embedding: ' + str(emb.shape)
        emb = emb[0]
    return list(map(round_float, emb))


def extract_keywords_without_quotes(input_string):
    keywords = []
    start_index = 0
    result_string = input_string

    while True:
        start_quote = input_string.find('"', start_index)
        if start_quote == -1:
            break

        end_quote = input_string.find('"', start_quote + 1)
        if end_quote == -1:
            break

        keywords_string = input_string[start_quote + 1:end_quote]
        keywords.append([keyword.strip().lower() for keyword in keywords_string.split(',')])
        result_string = result_string.replace(keywords_string, "")
        start_index = end_quote + 1

    return keywords, result_string.replace('"', "")


# Flask app
app = Flask(__name__)


################ Flask app ###############


def add_routes(app):
    @app.route('/get-embedding', methods=['POST', 'GET'])
    def get_embedding():
        results = {}

        if request.method == 'POST':
            uploaded_files = request.files.getlist("fileToUpload[]")
            for file in uploaded_files:
                emb = SYNC_ENGINE.indexer.encode_image(Image.open(file.stream))
                results[file.filename] = emb_to_list(emb)
            results['_mean_'] = emb_to_list(np.mean(list(results.values()), 0))
        else:
            if 'prompt' in request.args:
                emb = SYNC_ENGINE.indexer.encode_prompt(request.args['prompt'])
                results = emb_to_list(emb)

            elif 'src_image' in request.args:
                src_image = Path(request.args['src_image']).relative_to(IMAGES_PREFIX_URL)

                if '..' not in str(src_image):
                    path_image = images_path / src_image
                    if path_image.exists():
                        emb = SYNC_ENGINE.indexer.encode_image(Image.open(path_image))
                        results = emb_to_list(emb)

        return jsonify(results)

    @app.route('/tags', methods=['POST'])
    def update_tags():
        data = request.get_json()
        fname = data["fname"]
        tags = data["tags"]
        print("updating", data)
        res = SYNC_ENGINE.milvus.get_one(fname)
        if len(res) == 1:
            print(res[0])
            SYNC_ENGINE.milvus.upsert([{**res[0], "fname": fname, "manual_keywords": tags, }])
        else:
            return jsonify({"failed"})

        return jsonify({"success": True})

    @app.route('/search', methods=['POST'])
    def do_the_magic():
        file_url = request.json.get('fileUrl', None)
        print("file_url", file_url)
        text = request.json.get('text', '')
        keywords, formatted_text = extract_keywords_without_quotes(text)

        if file_url:
            # Download the file from the URL
            response = requests.get(file_url)
            if response.status_code == 200:
                image_bytes = BytesIO(response.content)
                emb = SYNC_ENGINE.indexer.encode_image(Image.open(image_bytes), normalize=True)
            else:
                return jsonify({"error": "Failed to download the file from the provided URL"}), 400
        else:
            emb = SYNC_ENGINE.indexer.encode_prompt(formatted_text, normalize=True)

        results = emb_to_list(emb)
        query = np.array(results, dtype=np.float32)[np.newaxis]

        print("Searching for: ", query, keywords)

        res = SYNC_ENGINE.milvus.search(query, keywords, 1000)

        result_dict = []
        for hits_i, hits in enumerate(res):
            for hit_i, hit in enumerate(hits):
                print()
                pre_result_dict = {
                    "photo_url": str(IMAGES_PREFIX_URL / hit.entity.get('fname')),
                    'thumbnail_url': str(IMAGES_PREFIX_URL / hit.entity.get('metadata')["thumbnail"]),
                    'ext': str(hit.entity.get("metadata")["format"]),
                    'similarity': hit.distance,
                    "manual_keywords": list(hit.entity.get("manual_keywords"))
                }

                result_dict.append(pre_result_dict)

        return jsonify(result_dict)

    @app.route(str(IMAGES_PREFIX_URL / '<path:path>'), methods=["GET", "POST"])
    def send_image(path):
        print("thumbnail_dir", config['server']['thumbnail_dir'], "path: ", path)
        return send_from_directory(config['server']['thumbnail_dir'],
                                   path)

    @app.route(str(THUMBS_PREFIX_URL / '<path:path>'))
    def send_thumb(path):
        return Response(SYNC_ENGINE.thumbnail(path), mimetype='image/jpeg')


if __name__ == '__main__':
    cache_dir = config['server']['cache_dir']
    # Token: env var first, then optional config.ini value. Never hardcoded.
    milvus_token = os.environ.get("MILVUS_TOKEN") or (
        config['milvus']['token'] if config.has_option('milvus', 'token') else None
    )
    SYNC_ENGINE = SyncDir(
        config['server']['thumbnail_dir'],
        collection_name="mvp0",
        cache_dir=cache_dir,
        milvus_uri=config['milvus']['uri'],
        milvus_username=config['milvus']['user'],
        milvus_password=config['milvus']['password'],
        milvus_token=milvus_token,
        embedding_folder=config['server']['emb_dir'],
        json_file=config['server']['json_file']
    )

    CORS(app, resources={r"/*": {"origins": "*"}})
    add_routes(app)
    app.run(
        host=config['server']['host'],
        port=int(config['server']['port']),
        debug=config.getboolean('server', 'dev')
    )
