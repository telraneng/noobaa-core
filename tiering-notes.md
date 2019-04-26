# Tiering

### Step 1
- [x] `make_object_id()` separate to `new_object_id()` vs `parse_object_id()`
- [x] upload - test
- [x] read path in object_io and map_client
- [x] copy_object_mapping
- [x] MapClient chunk data cache
- [x] map_reader - implement read_object_mapping vs read_object_mapping_admin
- [x] digest_type and digest_b64 in map_db_types

### Step 2
- [ ] UI object-parts-reducer fix to chunks
- [ ] map_reader - read_node_mapping & read_host_mapping
- [ ] object_io - upload_copy should pass the object_md to read_object_stream - where to get it?
- [ ] map_builder - test

### Step 3
- [ ] map_reader should share prepare_chunks_group with map_server
- [ ] map_reader - implement update_chunks_on_read with location and move to top tier on read
- [ ] mapper._block_sorter_basic
- [ ] mapper._block_sorter_local
- [ ] mapper.should_rebuild_chunk_to_local_mirror

### Step 4
- [ ] md_store add @param/@returns jsdocs to verify callers
- [ ] obj.upload_size updates during upload - preserve or remove?
