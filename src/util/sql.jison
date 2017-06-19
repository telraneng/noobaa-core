/* description: Parses SQL */
/* :tabSize=4:indentSize=4:noTabs=true: */
%lex

%options case-insensitive

%%

[/][*](.|\n)*?[*][/]                             /* skip comments */
N?['](\\.|[^'])*[']                                 return 'STRING'
["](\\.|[^"])*["]                                   return 'QUOTED_IDENTIFIER'
[a-zA-Z_/][a-zA-Z0-9_/]*\.[a-zA-Z_/][a-zA-Z0-9_/]*  return 'QUALIFIED_IDENTIFIER'
[a-zA-Z_/][a-zA-Z0-9_/]*\.\*                        return 'QUALIFIED_STAR'
\s+                                              /* skip whitespace */
'SELECT'                                         return 'SELECT'
'TOP'                                            return 'TOP'
'FROM'                                           return 'FROM'
'WHERE'                                          return 'WHERE'
'DISTINCT'                                       return 'DISTINCT'
'BETWEEN'                                        return 'BETWEEN'
GROUP\s+BY\b                                     return 'GROUP_BY'
'HAVING'                                         return 'HAVING'
ORDER\s+BY\b                                     return 'ORDER_BY'
(UNION\s+ALL|UNION|INTERSECT|EXCEPT)\b           return 'SET_OPERATOR'
','                                              return 'COMMA'
'+'                                              return 'PLUS'
'-'                                              return 'MINUS'
'/'                                              return 'DIVIDE'
'*'                                              return 'STAR'
'%'                                              return 'MODULO'
'='                                              return 'CMP_EQUALS'
'!='                                             return 'CMP_NOTEQUALS'
'<>'                                             return 'CMP_NOTEQUALS_BASIC'
'>='                                             return 'CMP_GREATEROREQUAL'
'>'                                              return 'CMP_GREATER'
'<='                                             return 'CMP_LESSOREQUAL'
'<'                                              return 'CMP_LESS'
'('                                              return 'LPAREN'
')'                                              return 'RPAREN'
'||'                                             return 'CONCAT'
'AS'                                             return 'AS'
'ALL'                                            return 'ALL'
'ANY'                                            return 'ANY'
'SOME'                                           return 'SOME'
'EXISTS'                                         return 'EXISTS'
'IS'                                             return 'IS'
'IN'                                             return 'IN'
'ON'                                             return 'ON'
'AND'                                            return 'LOGICAL_AND'
'OR'                                             return 'LOGICAL_OR'
'NOT'                                            return 'LOGICAL_NOT'
INNER\s+JOIN\b                                   return 'INNER_JOIN'
LEFT\s+OUTER\s+JOIN\b                            return 'LEFT_OUTER_JOIN'
RIGHT\s+OUTER\s+JOIN\b                           return 'RIGHT_OUTER_JOIN'
JOIN\b                                           return 'JOIN'
LEFT\s+JOIN\b                                    return 'LEFT_JOIN'
RIGHT\s+JOIN\b                                   return 'RIGHT_JOIN'
FULL\s+JOIN\b                                    return 'FULL_JOIN'
NATURAL\s+JOIN\b                                 return 'NATURAL_JOIN'
CROSS\s+JOIN\b                                   return 'CROSS_JOIN'
'CASE'                                           return 'CASE'
'WHEN'                                           return 'WHEN'
'THEN'                                           return 'THEN'
'ELSE'                                           return 'ELSE'
'END'                                            return 'END'
'LIKE'                                           return 'LIKE'
'ASC'                                            return 'ASC'
'DESC'                                           return 'DESC'
'NULLS'                                          return 'NULLS'
'FIRST'                                          return 'FIRST'
'LAST'                                           return 'LAST'
'OPTION'                                         return 'OPTION'
'WITH'                                           return 'WITH'
'CAST'                                           return 'CAST'
'NULL'                                           return 'NULL'
'TRUE'                                           return 'TRUE'
'FALSE'                                          return 'FALSE'
[0-9]+(\.[0-9]+)?                                return 'NUMERIC'
[a-zA-Z_/][a-zA-Z0-9_/]*                         return 'IDENTIFIER'
[?]                                              return 'BIND'
<<EOF>>                                          return 'EOF'
.                                                return 'INVALID'

/lex

%start main

%% /* language grammar */

main
    : select_clause EOF { return $1; }
    ;

select_clause
    : SELECT
        distinct_clause_opt
        top_clause_opt
        select_expr_list 
        from_clause_opt
        where_clause_opt
        group_by_clause_opt
        having_clause_opt
        order_by_clause_opt
        query_hints_clause_opt
        set_operation_opt
        { 
            $$ = {
                node: 'SELECT',
                distinct: $2,
                top: $3,
                columns: $4,
                from: $5,
                where: $6,
                group_by: $7,
                having: $8,
                order_by: $9,
                query_hints: $10,
                set_op: $11,
            };
        }
    ;

distinct_clause_opt
    : { $$ = false; }
    | DISTINCT { $$ = true; }
    ;

top_clause_opt
    : { $$ = null; }
    | TOP NUMERIC { $$ = Number($2); }
    ;

where_clause_opt
    : { $$ = null; }
    | WHERE expression { $$ = $2; }
    ;

group_by_clause_opt
    : { $$ = null; }
    | GROUP_BY group_by_list { $$ = $2; }
    ;

group_by_list
    : group_by_item                     { $$ = [$1]; }
    | group_by_list COMMA group_by_item { $$ = $1; $1.push($3); }
    ;

group_by_item
    : expression            { $$ = { node: 'GROUP_BY', value: $1 }; }
    ;

having_clause_opt
    : { $$ = null; }
    | HAVING expression     { $$ = $2; }
    ;

order_by_clause_opt
    : { $$ = null; }
    | ORDER_BY order_by_list { $$ = $2; }
    ;

order_by_list
    : order_by_item                     { $$ = [$1]; }
    | order_by_list COMMA order_by_item { $$ = $1; $1.push($3); }
    ;

order_by_item
    : expression
        order_by_dir_opt
        order_by_nulls_opt 
        { $$ = { node: 'ORDER_BY', value: $1, dir: $2, nulls: $3 }; }
    ;
    
order_by_dir_opt
    : { $$ = ''; }
    | ASC           { $$ = 'ASC'; }
    | DESC          { $$ = 'DESC'; }
    ;

order_by_nulls_opt
    : { $$ = ''; }
    | NULLS FIRST   { $$ = 'FIRST'; }
    | NULLS LAST    { $$ = 'LAST'; }
    ;

query_hints_clause_opt
    : { $$ = null; }
    | OPTION LPAREN query_hint_list RPAREN { $$ = $3; }
    ;

query_hint_list
    : query_hint                        { $$ = [$1]; }
    | query_hint_list COMMA query_hint  { $$ = $1; $1.push($3); }
    ;

query_hint
    : query_hint IDENTIFIER     { $$ = $1; $1.push($2); }
    | query_hint CMP_EQUALS     { $$ = $1; $1.push($2); }
    | query_hint NUMERIC        { $$ = $1; $1.push(Number($2)); }
    | query_hint STRING         { $$ = $1; $1.push($2.slice(1,-1)); }
    | IDENTIFIER                { $$ = [$1]; }
    ;

set_operation_opt
    : { $$ = null }
    | SET_OPERATOR select_clause { $$ = { node: 'SET_OP', op: $1, value: $2 }; }
    ;

select_expr_list
    : select_expr                           { $$ = [$1]; } 
    | select_expr_list COMMA select_expr    { $$ = $1; $1.push($3); }
    ;

select_expr
    : star                  { $$ = { node: 'COLUMN', value: $1 }; }
    | expression alias_opt  { $$ = { node: 'COLUMN', value: $1, alias: $2 }; }
    ;

from_clause_opt
    : { $$ = null; }
    | FROM from_list { $$ = $2; }
    ;

from_list
    : from_item                                             { $$ = [$1]; }
    | from_list COMMA from_item                             { $$ = $1; $1.push($3); }
    | from_list join_modifier_opt from_item                 { $$ = $1; $1.push($3); $3.join = $2; }
    | from_list join_modifier_opt from_item ON expression   { $$ = $1; $1.push($3); $3.join = $2; $3.expr = $5; }
    ;

from_item
    : from_item_source alias_opt table_hints_opt            { $$ = { node: 'FROM', value: $1, alias: $2, hints: $3 }; }
    ;

from_item_source
    : IDENTIFIER                    { $$ = $1; }
    | QUOTED_IDENTIFIER             { $$ = $1.slice(1,-1); }
    | QUALIFIED_IDENTIFIER          { $$ = $1; }
    | LPAREN select_clause RPAREN   { $$ = $2; }
    ;

alias_opt
    : { $$ = null; }
    | IDENTIFIER            { $$ = { value: $1 }; }
    | AS IDENTIFIER         { $$ = { value: $2, as: 1 }; }
    ;

table_hints_opt
    : { $$ = null; }
    | WITH LPAREN table_hint_list RPAREN { $$ = $3; }
    ;

table_hint_list
    : table_hint_expr                           { $$ = [$1]; }
    | table_hint_list COMMA table_hint_expr     { $$ = $1; $1.push($3); }
    ;

table_hint_expr
    : IDENTIFIER            { $$ = $1; }
    | QUOTED_IDENTIFIER     { $$ = $1.slice(1,-1); }
    | STRING                { $$ = $1.slice(1,-1); }
    ;
    
join_modifier_opt
    : JOIN             { $$ = ''; }
    | LEFT_JOIN        { $$ = 'LEFT'; }
    | LEFT_OUTER_JOIN  { $$ = 'LEFT OUTER'; }
    | RIGHT_JOIN       { $$ = 'RIGHT'; }
    | RIGHT_OUTER_JOIN { $$ = 'RIGHT OUTER'; }
    | FULL_JOIN        { $$ = 'FULL'; }
    | INNER_JOIN       { $$ = 'INNER'; }
    | CROSS_JOIN       { $$ = 'CROSS'; }
    | NATURAL_JOIN     { $$ = 'NATURAL'; }
    ;

expression
    : condition         { $$ = $1; }
    | and_condition     { $$ = $1; }
    | or_condition      { $$ = $1; }
    ;

or_condition
    : condition LOGICAL_OR condition            { $$ = { node: 'OR', value: [$1,$3] }; }
    | condition LOGICAL_OR and_condition        { $$ = { node: 'OR', value: [$1,$3] }; }
    | and_condition LOGICAL_OR and_condition    { $$ = { node: 'OR', value: [$1,$3] }; }
    | and_condition LOGICAL_OR condition        { $$ = { node: 'OR', value: [$1,$3] }; }
    | or_condition LOGICAL_OR condition         { $$ = $1; $1.value.push($3); }
    | or_condition LOGICAL_OR and_condition     { $$ = $1; $1.value.push($3); }
    ;

and_condition
    : condition LOGICAL_AND condition           { $$ = { node: 'AND', value: [$1,$3] }; }
    | and_condition LOGICAL_AND condition       { $$ = $1; $1.value.push($3); }
    ;

condition
    : operand                                   { $$ = $1; }
    | operand rhs_condition                     { $$ = {node: 'COND', left: $1, right: $2}; }
    | EXISTS LPAREN select_clause RPAREN        { $$ = {node: 'EXISTS', value: $3}; }
    | LOGICAL_NOT condition                     { $$ = {node: 'NOT', value: $2}; }
    ;

compare
    : CMP_EQUALS            { $$ = $1; }
    | CMP_NOTEQUALS         { $$ = $1; }
    | CMP_NOTEQUALS_BASIC   { $$ = $1; }
    | CMP_GREATER           { $$ = $1; }
    | CMP_GREATEROREQUAL    { $$ = $1; }
    | CMP_LESS              { $$ = $1; }
    | CMP_LESSOREQUAL       { $$ = $1; }
    ;

rhs_condition
    : rhs_compare_test      { $$ = $1; }
    | rhs_is_test           { $$ = $1; }
    | rhs_in_test           { $$ = $1; }
    | rhs_like_test         { $$ = $1; }
    | rhs_between_test      { $$ = $1; }
    ;

rhs_compare_test
    : compare operand                           { $$ = { node: 'COMPARE', op: $1, value: $2 }; }
    | compare ALL LPAREN select_clause RPAREN   { $$ = { node: 'COMPARE_SELECT', op: $1, kind: $2, value: $4 }; }
    | compare ANY LPAREN select_clause RPAREN   { $$ = { node: 'COMPARE_SELECT', op: $1, kind: $2, value: $4 }; }
    | compare SOME LPAREN select_clause RPAREN  { $$ = { node: 'COMPARE_SELECT', op: $1, kind: $2, value: $4 }; }
    ;

rhs_is_test
    : IS operand                            { $$ = { node: 'IS', value: $2 }; }
    | IS LOGICAL_NOT operand                { $$ = { node: 'IS', value: $3, not: 1 }; }
    | IS DISTINCT FROM operand              { $$ = { node: 'IS', value: $4, distinct_from:1 }; }
    | IS LOGICAL_NOT DISTINCT FROM operand  { $$ = { node: 'IS', value: $5, distinct_from:1, not: 1 }; }
    ;
    
rhs_in_test
    : IN LPAREN rhs_in_clause RPAREN                { $$ = $3; }
    | LOGICAL_NOT IN LPAREN rhs_in_clause RPAREN    { $$ = $4; $4.not = 1; }
    ;

rhs_in_clause
    : select_clause                                 { $$ = { node: 'IN_SELECT', value: $1 }; }
    | expression COMMA comma_sep_expr_list          { $$ = { node: 'IN_LIST', value: $3}; $3.unshift($1); }
    ;

rhs_like_test
    : LIKE operand                                  { $$ = { node: 'LIKE', value: $2 }; }
    | LOGICAL_NOT LIKE operand                      { $$ = { node: 'LIKE', value: $3, not: 1 }; }
    ;

rhs_between_test
    : BETWEEN operand LOGICAL_AND operand               { $$ = { node: 'BETWEEN', left: $2, right: $4 }; }
    | LOGICAL_NOT BETWEEN operand LOGICAL_AND operand   { $$ = { node: 'BETWEEN', left: $3, right: $5, not: 1 }; }
    ;

comma_sep_expr_list
    : comma_sep_expr_list COMMA expression          { $$ = $1; $1.push($3); }
    | expression { $$ = [$1]; }
    ;

/*
 * Function params are defined by an optional list of func_arg elements,
 * because you may call functions of with STAR/QUALIFIED_STAR parameters (Like COUNT(*)),
 * which aren't `Term`(s) because they cant't have an alias
 */
func_arg_list_opt
    : { $$ = null; }
    | func_arg_list { $$ = $1; }
    ;

func_arg_list
    : func_arg_list COMMA func_arg { $$ = $1; $1.push($3); }
    | func_arg { $$ = [$1]; }
    ;

func_arg
    : expression            { $$ = $1; }
    | star                  { $$ = $1; }
    | DISTINCT expression   { $$ = { node: 'DISTINCT_ARG', value: $2 }; }
    ;

operand
    : summand                   { $$ = $1; }
    | operand CONCAT summand    { $$ = { node: 'OPERAND', left: $1, right: $3, op: $2 }; }
    ;

summand
    : factor                    { $$ = $1; }
    | summand PLUS factor       { $$ = { node: 'SUMMAND', left: $1, right: $3, op:$2 }; }
    | summand MINUS factor      { $$ = { node: 'SUMMAND', left: $1, right: $3, op:$2 }; }
    ;

factor
    : term                      { $$ = $1; }
    | factor DIVIDE term        { $$ = {node: 'FACTOR', left: $1, right: $3, op: $2 }; }
    | factor STAR term          { $$ = {node: 'FACTOR', left: $1, right: $3, op: $2 }; }
    | factor MODULO term        { $$ = {node: 'FACTOR', left: $1, right: $3, op: $2 }; }
    ;

term
    : value                                                 { $$ = $1; }
    | field                                                 { $$ = $1; }
    | case_when                                             { $$ = $1; }
    | LPAREN select_clause RPAREN                           { $$ = $2; }
    | IDENTIFIER LPAREN func_arg_list_opt RPAREN            { $$ = { node: 'FUNC', name: $1, args: $3 }; }
    | QUALIFIED_IDENTIFIER LPAREN func_arg_list_opt RPAREN  { $$ = { node: 'FUNC', name: $1, args: $3 }; }
    | CAST LPAREN expression AS data_type RPAREN            { $$ = { node: 'CAST', expression: $3, data_type: $5 }; }
    ;

data_type
    : IDENTIFIER data_type_len_opt          { $$ = { name: $1, len: $2 }; }
    | QUOTED_IDENTIFIER data_type_len_opt   { $$ = { name: $1.slice(1,-1), len: $2 }; }
    ;

data_type_len_opt
    : { $$ = null; }
    | LPAREN NUMERIC RPAREN { $$ = Number($2); }
    ;

case_when
    : CASE case_when_list case_when_else_opt END { $$ = { node: 'CASE', clauses: $2, else: $3 }; }
    ;

case_when_list
    : case_when_list WHEN expression THEN expression    { $$ = $1; $1.push({ node: 'CASE_ITEM', when: $3, then: $5 }); }
    | WHEN expression THEN expression                   { $$ = [{ node: 'CASE_ITEM', when: $2, then: $4 }]; }
    ;

case_when_else_opt
    : { $$ = null; }
    | ELSE expression { $$ = $2; }
    ;

value
    : STRING    { $$ = { node: 'VALUE', value: $1.slice(1,-1) }; } 
    | NUMERIC   { $$ = { node: 'VALUE', value: Number($1) }; }
    | TRUE      { $$ = { node: 'VALUE', value: true }; }
    | FALSE     { $$ = { node: 'VALUE', value: false }; }
    | NULL      { $$ = { node: 'VALUE', value: null }; }
    | BIND      { $$ = { node: 'BIND' }; }
    ;

field
    : IDENTIFIER            { $$ = {node: 'FIELD', value: $1 }; }
    | QUOTED_IDENTIFIER     { $$ = {node: 'FIELD', value: $1.slice(1,-1) }; }
    | QUALIFIED_IDENTIFIER  { $$ = {node: 'FIELD', value: $1 }; }
    ;

star
    : STAR              { $$ = { node: 'STAR' }; }
    | QUALIFIED_STAR    { $$ = { node: 'STAR', value: $1 }; }
    ;
