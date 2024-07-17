import configparser

from pymilvus import Collection, DataType, FieldSchema, CollectionSchema
from pymilvus import connections, utility


class Milvus:
    def __init__(self, milvus_uri, user, password, collection_name):
        print("Connecting to milvus")
        connections.connect("default",
                            uri=milvus_uri,
                            token="5f3f05f40d1a1062964e0054e010e8d02c6f65e37d586be90cef81525e109b0bc06cb1aa79797ad4869220f300c73a6209578417",
                            # user=user,
                            # password=password)
                            )

        self.DIM = 1024  # dimension of vector
        self._collection = None
        self._collection = self.setup_collection(collection_name)
        print("Successfully connected to Milvus")

    def setup_collection(self, collection_name) -> Collection:
        try:
            check_collection = utility.has_collection(collection_name)
            if check_collection:
                collection = Collection(name=collection_name)
                return collection

            image_vector = FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=self.DIM,
                                    description="vector which represents the image", )
            fname = FieldSchema(name="fname", dtype=DataType.VARCHAR, max_length=512,
                                description="path of the image", is_primary=True, auto_id=False)
            keywords = FieldSchema(name="keywords", dtype=DataType.ARRAY, element_type=DataType.VARCHAR,max_length=300, max_capacity=50,
                                    description="keywords for the image", )
            manual_keywords = FieldSchema(name="manual_keywords", dtype=DataType.ARRAY,element_type=DataType.VARCHAR,max_length=50, max_capacity=50,
                                    description="manual keywords for the image", )

            metadata = FieldSchema(name="metadata", dtype=DataType.JSON, description="metadata of the image", )

            schema = CollectionSchema(fields=[image_vector, fname, metadata, keywords, manual_keywords],
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
        except Exception as e:
            print("Error in setting up collection :", e)
            raise(e)

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
