# Tiering

### HIGH
- [x] `make_object_id()` separate to `new_object_id()` vs `parse_object_id()`
- [x] upload - test
- [x] read path in object_io and map_client
- [x] copy_object_mapping
- [x] MapClient chunk data cache
- [x] map_reader - implement read_object_mapping vs read_object_mapping_admin
- [x] digest_type and digest_b64 in map_db_types

- [x] test_object_io
- [ ] test_map_builder
- [ ] test_map*
- [ ] test*

- [ ] infinite loop in map client when no nodes for allocation
- [ ] UI object-parts-reducer fix to chunks
- [ ] map_reader - read_node_mapping & read_host_mapping
- [ ] object_io - upload_copy should pass the object_md to read_object_stream - where to get it?

### LOW
- [ ] map_reader should share prepare_chunks_group with map_server
- [ ] map_reader - implement update_chunks_on_read with location and move to top tier on read
- [ ] mapper._block_sorter_basic
- [ ] mapper._block_sorter_local
- [ ] mapper.should_rebuild_chunk_to_local_mirror

### ADVANCED
- [ ] ts compile
- [ ] test multiple tiers
- [ ] chunk on two tiers for "caching" - implement as single chunk with two fragsets? or two "linked" chunks? I think the best is to have a second chunk link from the file parts.
- [ ] re-encode chunk when tier coding changes

### FINISH
- [ ] md_store add @param/@returns jsdocs to verify callers
- [ ] obj.upload_size updates during upload - preserve or remove?
