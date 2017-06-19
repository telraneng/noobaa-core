# PARSER : https://github.com/Hardmath123/nearley

@lexer lexer

start 
    ->  sql_list {% $1 %}

sql_list
    ->  sql_clause                  {% $lr_first  %}
    |   sql_list sql_clause         {% $lr_push2 %}

sql_clause
    ->  select_clause %SEMICOLON    {% $1 %}


## SELECT

select_clause
    ->  %SELECT distinct_clause? top_clause?
        columns_list from_clause? where_clause?
        group_by_clause? having_clause? order_by_clause?
        query_hints_clause? set_operation?
            {% ([
                select, distinct, top,
                columns, from, where,
                group_by, having, order_by,
                query_hints, set_op
            ]) => ({
                t: 'SELECT', distinct, top,
                columns, from, where,
                group_by, having, order_by, 
                query_hints, set_op
            }) %}

distinct_clause?
    ->  null        {% () => false %}
    |   %ALL        {% () => false %}
    |   %DISTINCT   {% () => true  %}

top_clause?
    ->  null        {% $undef %}
    |   "TOP" uint  {% $2 %}


## COLUMNS

columns_list
    ->  column_expr                         {% $lr_first  %}
    |   columns_list %COMMA column_expr     {% $lr_push3 %}

column_expr
    ->  star_expr           {% ([v])    => ({ t: 'COLUMN', v })           %}
    |   expression alias?   {% ([v,a])  => ({ t: 'COLUMN', v, alias: a }) %}

star_expr
    ->  %STAR           {% ()    => ({ t: 'STAR' }) %}
    |   id %DOT %STAR   {% ([v]) => ({ t: 'STAR', v }) %}

alias?
    ->  null            {% $undef %}
    |   id              {% ([v])  => ({ t: 'ALIAS', v })        %}
    |   %AS id          {% ([,v]) => ({ t: 'ALIAS', v, as: 1 }) %}


## FROM

from_clause?
    ->  null                                {% $undef %}
    |   %FROM from_list                     {% $2 %}
    |   %FROM from_list join_list           {% ([,l,j]) => l.concat(j) %}

from_list
    ->  from_item                           {% $lr_first  %}
    |   from_list %COMMA from_item          {% $lr_push3 %}

from_item 
    ->  from_source alias? table_hints? 
            {% ([v,a,h]) => ({ t: 'FROM', v, alias: a, hints: h }) %}

from_source
    ->  id_expr         {% $1 %}
    |   select_expr     {% $1 %}


## JOIN

join_list
    ->  join_item                           {% $lr_first %}
    |   join_list join_item                 {% $lr_push2 %}

join_item
    ->  join_type from_item                 {% ([j,i])    => { i.join=j;         return i; } %}
    |   join_type from_item %ON expression  {% ([j,i,,e]) => { i.join=j; j.on=e; return i; } %}

join_type
    ->  %JOIN                   {% () => ({ t: 'JOIN' })                            %}
    |   %LEFT %JOIN             {% () => ({ t: 'JOIN', left: true })                %}
    |   %LEFT %OUTER %JOIN      {% () => ({ t: 'JOIN', left: true, outer: true })   %}
    |   %RIGHT %JOIN            {% () => ({ t: 'JOIN', right: true })               %}
    |   %RIGHT %OUTER %JOIN     {% () => ({ t: 'JOIN', right: true, outer: true })  %}
    |   %FULL %JOIN             {% () => ({ t: 'JOIN', full: true })                %}
    |   %INNER %JOIN            {% () => ({ t: 'JOIN', inner: true })               %}
    |   %CROSS %JOIN            {% () => ({ t: 'JOIN', cross: true })               %}
    |   %NATURAL %JOIN          {% () => ({ t: 'JOIN', natural: true })             %}


## WHERE

where_clause?
    ->  null                {% $undef %}
    |   %WHERE expression   {% $2 %}


## GROUP BY

group_by_clause?
    ->  null                        {% $undef %}
    |   %GROUP %BY group_by_list    {% $3 %}

group_by_list
    ->  group_by_item                         {% $lr_first  %}
    |   group_by_list %COMMA group_by_item    {% $lr_push3 %}

group_by_item
    ->  expression          {% ([v]) => ({ t: 'GROUP_BY', v }) %}

having_clause?
    ->  null                {% $undef %}
    |   %HAVING expression  {% $2 %}


## ORDER BY

order_by_clause?
    ->  null                        {% $undef %}
    |   %ORDER %BY order_by_list    {% $3 %}

order_by_list
    ->  order_by_item                       {% $lr_first  %}
    |   order_by_list %COMMA order_by_item   {% $lr_push3 %}

order_by_item
    ->  expression order_by_dir? order_by_nulls?
            {% ([v,d,n]) => ({ t: 'ORDER_BY', v, dir: d, nulls: n }) %}
    
order_by_dir?
    ->  null        {% $undef %}
    |   "ASC"       {% () => 'ASC'  %}
    |   "DESC"      {% () => 'DESC' %}

order_by_nulls?
    ->  null            {% $undef %}
    |   "NULLS" "FIRST" {% () => 'FIRST' %}
    |   "NULLS" "LAST"  {% () => 'LAST'  %}


## EXPRESSIONS

expression
    ->  condition       {% $1 %}
    |   and_condition   {% $1 %}
    |   or_condition    {% $1 %}

or_condition
    ->  condition %OR condition             {% ([a,,b]) => ({ t: 'OR', v: [a,b] }) %}
    |   condition %OR and_condition         {% ([a,,b]) => ({ t: 'OR', v: [a,b] }) %}
    |   and_condition %OR and_condition     {% ([a,,b]) => ({ t: 'OR', v: [a,b] }) %}
    |   and_condition %OR condition         {% ([a,,b]) => ({ t: 'OR', v: [a,b] }) %}
    |   or_condition %OR condition          {% ([a,,b]) => $push(a.v,b) && a %}
    |   or_condition %OR and_condition      {% ([a,,b]) => $push(a.v,b) && a %}

and_condition
    ->  condition %AND condition           {% ([a,,b]) => ({ t: 'AND', v: [a,b] }) %}
    |   and_condition %AND condition       {% ([a,,b]) => $push(a.v,b) && a %}

condition
    ->  operand                 {% $1 %}
    |   operand rhs_condition   {% ([l,c]) => { c.l = l; return c; }                %}
    |   %NOT condition          {% ([,c])  => { c.not = c.not ? 0 : 1; return c; }  %}
    |   %EXISTS select_expr     {% ([,v])  => ({ t: 'EXISTS', v })                  %}

operand
    ->  summand                 {% $1 %}
    |   operand ( %CONCAT ) summand 
            {% ([l,[op],r])  => ({ t: 'OPERAND', op: op.value, l, r }) %}

summand
    ->  factor                 {% $1 %}
    |   summand ( %PLUS | %MINUS ) factor
            {% ([l,[op],r])  => ({ t: 'SUMMAND', op: op.value, l, r }) %}

factor
    ->  term                     {% $1 %}
    |   factor ( %DIVIDE | %STAR | %MODULO ) term        
            {% ([l,[op],r])  => ({ t: 'FACTOR', op: op.value, l, r }) %}

term
    ->  func_expr       {% $1 %}
    |   value           {% $1 %}
    |   id_expr         {% $1 %}
    |   select_expr     {% $1 %}
    |   cast_expr       {% $1 %}
    |   case_when       {% $1 %}

value
    ->  string          {% ([v]) => ({ t: 'VALUE', v })         %} 
    |   number          {% ([v]) => ({ t: 'VALUE', v })         %}
    |   %TRUE           {% ()    => ({ t: 'VALUE', v: true })   %}
    |   %FALSE          {% ()    => ({ t: 'VALUE', v: false })  %}
    |   %NULL           {% ()    => ({ t: 'VALUE', v: null })   %}
    |   %BIND           {% ()    => ({ t: 'BIND' })             %}

select_expr
    -> %LPAREN select_clause %RPAREN    {% $2 %}

expr_list
    ->  expression                      {% $lr_first %}
    |   expr_list %COMMA expression     {% $lr_push3 %}


## IDENTIFIERS

id              -> %IDENTIFIER      {% ([x])    => x.value              %}
quoted_id       -> %DBL_STRING      {% ([x])    => x.value.slice(1,-1)  %}
qualified_id    -> id %DOT id       {% ([s,,i]) => s + '.' + i          %}

id_expr
    ->  id              {% ([v]) => ({ t: 'ID', v })         %}
    |   quoted_id       {% ([v]) => ({ t: 'ID', v })         %}
    |   qualified_id    {% ([v]) => ({ t: 'ID', v })         %}


## FUNCTIONS

# func_arg_list is not expr_list because it accepts also 
# star as in COUNT(*) or distinct expressions

func_expr
    ->  ( id | qualified_id ) %LPAREN func_arg_list %RPAREN
            {% ([[name],,args]) => ({ t: 'FUNC', name, args }) %}

func_arg_list
    ->  null                            {% $lr_empty %}
    |   func_arg                        {% $lr_first %}
    |   func_arg_list %COMMA func_arg   {% $lr_push3 %}

func_arg
    ->  expression              {% $1 %}
    |   star_expr               {% $1 %}
    |   %DISTINCT expression    {% ([,v]) => ({ t: 'DISTINCT', v }) %}


## RHS CONDITIONS

rhs_condition
    ->  rhs_compare_test    {% $1 %}
    |   rhs_is_test         {% $1 %}
    |   rhs_in_test         {% $1 %}
    |   rhs_like_test       {% $1 %}
    |   rhs_between_test    {% $1 %}

rhs_compare_test
    ->  compare_op operand
            {% ([op,r])     => ({ t: 'COMPARE', r, op }) %}
    |   compare_op ( %ALL | %ANY | %SOME ) select_expr
            {% ([op,[k],r]) => ({ t: 'COMPARE_SELECT', r, op, kind: k.value }) %}

rhs_is_test
    ->  %IS operand
            {% ([,r]) => ({ t: 'IS', r }) %}
    |   %IS %NOT operand
            {% ([,,r]) => ({ t: 'IS', r, not: 1 }) %}
    |   %IS %DISTINCT %FROM operand
            {% ([,,,r]) => ({ t: 'IS', r, distinct_from: 1 }) %}
    |   %IS %NOT %DISTINCT %FROM operand
            {% ([,,,r]) => ({ t: 'IS', r, distinct_from: 1, not: 1 }) %}
rhs_in_test
    ->  %IN select_expr                     {% ([,r])   => ({ t: 'IN_SELECT', r }) %}
    |   %NOT %IN select_expr                {% ([,,r])  => ({ t: 'IN_SELECT', r, not: 1 }) %}
    |   %IN %LPAREN expr_list %RPAREN       {% ([,,r])  => ({ t: 'IN_LIST', r }) %}
    |   %NOT %IN %LPAREN expr_list %RPAREN  {% ([,,,r]) => ({ t: 'IN_LIST', r, not: 1 }) %}

rhs_like_test
    ->  %LIKE operand           {% ([,r])   => ({ t: 'LIKE', r }) %}
    |   %NOT %LIKE operand      {% ([,r])   => ({ t: 'LIKE', r, not: 1 }) %}

rhs_between_test
    ->  %BETWEEN operand %AND operand       {% ([,a,,b]) => ({ t: 'BETWEEN', r: [a,b] }) %}
    |   %NOT %BETWEEN operand %AND operand  {% ([,,a,,b]) => ({ t: 'BETWEEN', r: [a,b], not: 1 }) %}

compare_op
    ->  %EQ     {% ([x]) => x.value %}
    |   %NEQ    {% ([x]) => x.value %}
    |   %GT     {% ([x]) => x.value %}
    |   %GTE    {% ([x]) => x.value %}
    |   %LT     {% ([x]) => x.value %}
    |   %LTE    {% ([x]) => x.value %}


## CASE WHEN

case_when
    ->  %CASE case_when_list case_when_else? %END 
            {% ([,w,e]) => ({ t: 'CASE', when: w, else: e }) %}

case_when_list
    ->  case_item                   {% $lr_first %}
    |   case_when_list case_item    {% $lr_push2 %}

case_item
    ->  %WHEN expression %THEN expression
            {% ([,w,,t]) => ({ t: 'CASE_ITEM', when: w, then: t }) %}

case_when_else?
    ->  null                {% $undef %}
    |   %ELSE expression    {% $2 %}


## CAST TYPE

cast_expr
    ->  %CAST %LPAREN expression %AS id cast_type_len? %RPAREN
            {% ([,,v,,c,l]) => ({ t: 'CAST', v, cast: c, len: l }) %}

cast_type_len?
    ->  null                    {% $undef %}
    |   %LPAREN int %RPAREN     {% $2 %}


## HINTS

query_hints_clause?
    ->  null                                        {% $undef %}
    |   "OPTION" %LPAREN query_hint_list %RPAREN    {% $3 %}

query_hint_list
    ->  query_hint                          {% $lr_first  %}
    |   query_hint_list %COMMA query_hint   {% $lr_push3 %}

query_hint
    ->  id                      {% $lr_first  %}
    |   query_hint id           {% $lr_push2 %}
    |   query_hint number       {% $lr_push2 %}
    |   query_hint string       {% $lr_push2 %}
    |   query_hint %EQ          {% $lr_push2 %}

table_hints?
    ->  null                                    {% $undef %}
    |   %WITH %LPAREN table_hint_list %RPAREN   {% $3 %}

table_hint_list
    ->  table_hint_expr                         {% $lr_first  %}
    |   table_hint_list %COMMA table_hint_expr  {% $lr_push3 %}

table_hint_expr
    ->  id          {% $1 %}
    |   quoted_id   {% $1 %}
    |   string      {% $1 %}


## SET OPERATIONS

set_operation?
    ->  null                        {% $undef %}
    |   %UNION select_clause        {% ([,v])   => ({ t: 'UNION', v }) %}
    |   %UNION %ALL select_clause   {% ([,,v])  => ({ t: 'UNION', v, all: 1 }) %}
    |   %INTERSECT select_clause    {% ([,v])   => ({ t: 'INTERSECT', v }) %}
    |   %EXCEPT select_clause       {% ([,v])   => ({ t: 'EXCEPT', v }) %}


## PRIMITIVES

string  ->  "N":? %STRING               {% ([,x])   => x.value.slice(1,-1)              %}
number  ->  sign %NUMBER                {% ([s,x])  => s * Number(x.value)              %}
sign    ->  (null | %PLUS | %MINUS)     {% ([[x]])  => x && x.value === '-' ? -1 : 1    %} 
int     ->  number              {% ([n],loc,reject) => Number.isInteger(n) ? n : reject %}
uint    ->  int                 {% ([n],loc,reject) => n >=0 ? n : reject               %}



@{%
// postprocess helpers
function $undef() { return undefined; }
function $1(d) { return d[0]; }
function $2(d) { return d[1]; }
function $3(d) { return d[2]; }
function $4(d) { return d[3]; }
function $5(d) { return d[4]; }
function $push(arr, item) {
    if (item) arr.push(item);
    return arr;
}
// LR - left recursion accumulation
function $lr_empty(d) { return []; }
function $lr_first(d) { return [d[0]]; }
function $lr_push2(d) { return $push(d[0], d[1]); }
function $lr_push3(d) { return $push(d[0], d[2]); }
function $lr_push4(d) { return $push(d[0], d[3]); }
function $lr_push5(d) { return $push(d[0], d[4]); }
%}
