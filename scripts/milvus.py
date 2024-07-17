import configparser

from pymilvus import Collection, DataType, FieldSchema, CollectionSchema
from pymilvus import connections, utility


class Milvus:
    def __init__(self, milvus_uri, user, password, collection_name):
        print("Connecting to milvus")
        connections.connect("default",
                            uri=milvus_uri,
                            token="95d55a77bc7de1d9734368f7272f8d5db5672cbba7b62536d572e37c0ac9acad029c228e3ed4a5db0c1e6aafec399f730cc0fe8c",
                            # user=user,
                            # password=password)
                            )

        self.DIM = 512  # dimension of vector
        self._collection = None
        self._collection = self.setup_collection(collection_name)
        print("Successfully connected to Milvus")

    def setup_collection(self, collection_name) -> Collection:
        check_collection = utility.has_collection(collection_name)
        if check_collection:
            collection = Collection(name=collection_name)
            return collection

        image_vector = FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=self.DIM,
                                   description="vector which represents the image", )
        fname = FieldSchema(name="fname", dtype=DataType.VARCHAR, max_length=512,
                            description="path of the image", is_primary=True, auto_id=False)

        metadata = FieldSchema(name="metadata", dtype=DataType.JSON, description="metadata of the image", )

        schema = CollectionSchema(fields=[image_vector, fname, metadata],
                                  auto_id=False,
                                  description="Textile Dev 01",
                                  enable_dynamic_field=False)

        collection = Collection(name=collection_name, schema=schema)

        index_params = {
            'metric_type': 'L2',
            'index_type': "FLAT",
            'params': {'nlist': 16384}
        }
        collection.create_index(field_name="embedding", index_params=index_params)
        collection.load()
        return collection

    def get_total_count(self):
        self.setup_collection(self._collection.name)
        return self._collection.num_entities

    def insert(self, vectors, file_paths):
        self._collection.insert([vectors, file_paths])

    def delete_not_found_in(self, file_paths):
        self._collection.delete(f"fname not in {file_paths}")

    def upsert(self, records):
        print("upserted records to milvus", len(records))
        self._collection.upsert(records)

    def get_one(self, fname):
        return self._collection.query(expr=f"fname == '{fname}'", limit=1,
                                      output_fields=["fname", "metadata", "keywords", "embedding"])

    def search(self, vector, keywords, top_n=5, output_fields=None):
        if output_fields is None:
            output_fields = ["fname", "metadata", "manual_keywords"]

        query = ""
        for pair in keywords:
            if query != "":
                query += " || "
            query += f"array_contains_all(keywords, {pair}) || array_contains_all(manual_keywords, {pair})"
        print("query", query)
        return self._collection.search(vector, anns_field="embedding", param={"nprobe": 256}, limit=top_n,
                                       output_fields=output_fields, expr=query)
