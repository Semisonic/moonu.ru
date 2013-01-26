
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('index', { title: 'Express' });
};

/*
 * GET transactions listing.
 */

exports.list = function(req, res){
  res.render('transactions', { title: 'Express' });
};