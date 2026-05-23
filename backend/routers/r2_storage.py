import os
from pathlib import PurePosixPath

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()


def get_r2_client():
    endpoint_url = os.getenv("R2_ENDPOINT_URL")
    access_key_id = os.getenv("R2_ACCESS_KEY_ID")
    secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY")
    region = os.getenv("R2_REGION", "auto")

    if not endpoint_url or not access_key_id or not secret_access_key:
        raise RuntimeError("R2 environment variables are missing")

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )


def get_r2_bucket_name():
    bucket = os.getenv("R2_BUCKET_NAME")
    if not bucket:
        raise RuntimeError("R2_BUCKET_NAME is missing")
    return bucket


def safe_object_name(filename):
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in filename)
    return safe.strip("._") or "import.pgn"


def build_pgn_object_key(filename, collection="lumbras"):
    safe_name = safe_object_name(filename)
    safe_collection = safe_object_name(collection)
    return str(PurePosixPath("pgn-imports", safe_collection, safe_name))


def r2_object_exists(object_key):
    client = get_r2_client()
    bucket = get_r2_bucket_name()
    try:
        client.head_object(Bucket=bucket, Key=object_key)
        return True
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status == 404:
            return False
        raise


def upload_fileobj_to_r2(file_obj, object_key, content_type="application/x-chess-pgn"):
    client = get_r2_client()
    bucket = get_r2_bucket_name()
    file_obj.seek(0)
    client.upload_fileobj(
        file_obj,
        bucket,
        object_key,
        ExtraArgs={"ContentType": content_type},
    )
    try:
        file_obj.seek(0)
    except ValueError:
        pass
    return object_key


def upload_path_to_r2(path, object_key, content_type="application/x-chess-pgn"):
    client = get_r2_client()
    bucket = get_r2_bucket_name()
    with open(path, "rb") as file_obj:
        client.upload_fileobj(
            file_obj,
            bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
    return object_key


def get_r2_prefix_stats(prefix="pgn-imports/lumbras/"):
    client = get_r2_client()
    bucket = get_r2_bucket_name()
    continuation_token = None
    object_count = 0
    total_size_bytes = 0

    while True:
        params = {"Bucket": bucket, "Prefix": prefix}
        if continuation_token:
            params["ContinuationToken"] = continuation_token

        response = client.list_objects_v2(**params)
        for item in response.get("Contents", []):
            key = item.get("Key", "")
            if key.endswith("/"):
                continue
            object_count += 1
            total_size_bytes += int(item.get("Size") or 0)

        if not response.get("IsTruncated"):
            break
        continuation_token = response.get("NextContinuationToken")
        if not continuation_token:
            break

    return {
        "prefix": prefix,
        "object_count": object_count,
        "size_bytes": total_size_bytes,
    }


def list_r2_objects(prefix):
    client = get_r2_client()
    bucket = get_r2_bucket_name()
    continuation_token = None

    while True:
        params = {"Bucket": bucket, "Prefix": prefix}
        if continuation_token:
            params["ContinuationToken"] = continuation_token

        response = client.list_objects_v2(**params)
        for item in response.get("Contents", []):
            key = item.get("Key", "")
            if key and not key.endswith("/"):
                yield key

        if not response.get("IsTruncated"):
            break
        continuation_token = response.get("NextContinuationToken")
        if not continuation_token:
            break


def delete_r2_objects(object_keys, batch_size=1000):
    client = get_r2_client()
    bucket = get_r2_bucket_name()
    deleted = 0
    batch = []

    for object_key in object_keys:
        batch.append({"Key": object_key})
        if len(batch) >= batch_size:
            response = client.delete_objects(Bucket=bucket, Delete={"Objects": batch})
            deleted += len(response.get("Deleted", []))
            batch.clear()

    if batch:
        response = client.delete_objects(Bucket=bucket, Delete={"Objects": batch})
        deleted += len(response.get("Deleted", []))

    return deleted
