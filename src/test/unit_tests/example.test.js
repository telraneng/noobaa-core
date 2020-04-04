const assert = require('assert');

describe('Simple Math Test', () => {
 it('should return Evgeny', () => {
        assert.match('Evgeny', /Evgeny/);
    });
 it('should return PR#', () => {
        assert.match('PR# 555', /555/);
    });
});