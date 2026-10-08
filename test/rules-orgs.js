/* test/rules.js again, with every club in its mock moved to orgs/{code}
   (AUTH.md, *The move to `orgs/{orgId}`*): each expectation the rules hold a
   club to on workspaces/ has to hold once it has moved. rules.js says how. */
process.env.RULES_TREE = 'orgs';
require('./rules.js');
