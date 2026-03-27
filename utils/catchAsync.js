module.exports = fn => {
  return (req, res, next) => {
    // This catches any error in the async function and passes it to next()
    fn(req, res, next).catch(next); 
  };
};