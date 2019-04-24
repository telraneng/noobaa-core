# Tiering

### Step 1
- [x] `make_object_id()` separate to `new_object_id()` vs `parse_object_id()`
- [x] upload - test
- [x] read path in object_io and map_client
- [x] copy_object_parts
- [x] MapClient chunk data cache
- [ ] map_reader - implement read_object_mapping vs read_object_mappings_admin
- [ ] digest_type and digest_b64 in map_db_types

- [ ] upload_copy should pass the object_md to read_object_stream - where to get it?
- [ ] map_builder - test

### Step 2
- [ ] md_store add @param/@returns jsdocs to verify callers


### Step 3
- [ ] obj.upload_size updates during upload - preserve or remove?
