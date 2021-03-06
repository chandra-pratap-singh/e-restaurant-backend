const Product = require("../db/models/product");
const Category = require("../db/models/category");

exports.addProductToDb = (newProduct) => {
  const product = new Product({ ...newProduct });
  return product.save();
};

exports.getProductListFromDb = (
  filters = {},
  fields,
  skip = 0,
  limit = null
) => {
  return Product.find({ ...filters }, fields)
    .skip(skip)
    .limit(limit)
    .populate("category");
};

exports.countProductsInDb = (filters = {}) => {
  return Product.find(filters).count();
};

exports.getProductFromDb = (filter = {}, fields) => {
  return !!filter._id
    ? Product.findById(filter._id, fields).populate("category")
    : Product.findOne({ ...filter }, fields).populate("category");
};

exports.getUniqueProductCategoryListFromDb = async () => {
  const categoryIds = await Product.find({}, "category").distinct("category");
  return Promise.all(categoryIds.map((id) => Category.findById(id)));
};

exports.updateProductInDb = (updatedProduct) => {
  const { _id, productId } = updatedProduct;
  return _id
    ? Product.findByIdAndUpdate(_id, updatedProduct, { new: true })
    : Product.findOneAndUpdate({ productId }, updatedProduct, { new: true });
};

exports.deleteProductFromDb = (productId) => {
  return Product.deleteOne({ productId });
};
