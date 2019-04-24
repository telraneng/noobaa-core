/* Copyright (C) 2016 NooBaa */
'use strict';

import { MongoClient, ObjectID, Binary } from 'mongodb';

async function main() {
    const client = await MongoClient.connect('mongodb://localhost');
    const db = client.db('test');
    const col = db.collection('test');
    await col.insertOne({ id: 1, buf: new Binary(Buffer.from('one')) });
    console.log(await col.find().toArray());
    await client.close();
}

main();
