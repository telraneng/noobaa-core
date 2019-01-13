# Tiering

# coretest
- init_test_nodes is commented out!!!


## MapClient
<!-- - move ObjectIO functions - write_block, replicate_block, read_frags, etc... -->

## GetMapping
<!-- - chunk.tier: on write pick tier_for_write, on rebuild preserve, on make_room update. -->
<!-- - handle delete/remove tier from bucket? the chunks still refer to a deleted tier. (already in map_builder.prepare_and_fix_chunks?) -->

## PutMapping
<!-- - parts WTF -->
<!-- - dup_chunk -->
- get_part_info/get_chunk_info for read_object_mapping/read_node_mapping/read_host_mapping - decide if to reverse so that chunks refer to parts.
- obj.upload_size updates during upload - preserve or remove?

<!-- ## MapBuilder
- locks
- run build a second time on the allocated chunks
- system_store.refresh - should probably move up to scrubber
- reload_chunks + load_parts_objects_for_chunks + load_blocks_for_chunks
    - populate chunk refs to: bucket, tier, chunk_coder_config, objects, parts, blocks.
    - prepare_and_fix_chunks
        - deleted tier -> select_tier_for_write
        - deleted bucket -> delete chunk, parts, objects, blocks
        - deleted chunk -> delete blocks
        - no object parts references to this chunk -> delete chunk + blocks -->
