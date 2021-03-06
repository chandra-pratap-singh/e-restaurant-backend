const {
  addUserToDb,
  getUserFromDb,
  updateUserInDb,
} = require("../services/user");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  SIGNUP_FAILED,
  EMAIL_DOES_NOT_EXISTS,
  WRONG_PASSWORD,
  LOGIN_FAILED,
  ITEM_NOT_REMOVED_FROM_CART,
  ITEM_NOT_ADDED_TO_CART,
  ORDER_STATES,
  USER_NOT_FOUND,
  CANNOT_UPDATE_USER,
  CANNOT_GET_USER,
  ORDER_FAILED,
  USER_PROPERTIES,
  CANNOT_GET_ORDERS,
  CANNOT_UPDATE_ADDRESS,
  CANNOT_DELETE_ADDRESS,
  SINGUP_MAIL_SUBJECT,
  CANNOT_UPDATE_PASSWORD,
  CANNOT_SEND_MAIL,
} = require("../constants");
const { generateRandomUniqueId, generateJWT } = require("../util");
const user = require("../db/models/user");
const admin = require("../db/models/admin");
const { getAdminFromDb } = require("../services/admin");
const { getProductFromDb } = require("../services/products");
const {
  addOrderToDb,
  getOrderListFromDb,
  countOrdersInDb,
} = require("../services/orders");
const { sendMail } = require("../mailer");

exports.signUp = async (req, res, next) => {
  const user = req.body.user;
  const hashedPwd = await bcrypt.hash(user.password, 12);
  const { name, email, phone, address } = user;
  const newUser = {
    userId: generateRandomUniqueId(),
    name,
    password: hashedPwd,
    email,
    phone,
    addresses: [
      { name, email, phone, address, addressId: generateRandomUniqueId() },
    ],
    cartItems: [],
    orders: [],
  };
  try {
    const testEmailUser = await getUserFromDb({ email });
    if (testEmailUser)
      return res.status(500).json({ message: "This Email already exists" });
    const testPhoneUser = await getUserFromDb({ phone });
    if (testPhoneUser)
      return res
        .status(500)
        .json({ message: "This Phone number already exists" });
  } catch {
    res.status(500).json({ message: SIGNUP_FAILED });
  }
  addUserToDb(newUser)
    .then((user) => {
      const token = generateJWT({
        email: user.email,
        userId: user.userId,
        phone: user.phone,
        name: user.name,
      });
      const {
        password: uPassword,
        cartItems: uCartItems,
        orders: uOrders,
        ...userResponse
      } = user;
      res.status(200).json({
        user: userResponse,
        token: token,
      });
      sendMail(
        email,
        SINGUP_MAIL_SUBJECT,
        `Thank You ${name} for signingup at E-restaurant`
      );
    })
    .catch(() => res.status(500).json({ message: SIGNUP_FAILED }));
};

const adminLogin = (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;
  admin
    .findOne({ email })
    .then((admin) => {
      bcrypt.compare(password, admin.password).then((isEqual) => {
        if (!isEqual) {
          res.status(500).json({ message: LOGIN_FAILED });
        }
        const token = generateJWT({
          email: admin.email,
          userId: admin.userId,
          phone: admin.phone,
          name: admin.name,
        });
        res.status(200).json({
          userId: user.userId,
          name: user.name,
          adminToken: token,
        });
      });
    })
    .catch((err) => res.status(500).json({ message: LOGIN_FAILED }));
};

exports.userLogin = (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;
  user
    .findOne({ email })
    .then((user) => {
      if (!user) {
        res.status(500).json({ message: EMAIL_DOES_NOT_EXISTS });
      }
      bcrypt.compare(password, user.password).then((isEqual) => {
        if (!isEqual) {
          res.status(500).json({ message: WRONG_PASSWORD });
        }
        const token = generateJWT({
          email: user.email,
          userId: user.userId,
          phone: user.phone,
          name: user.name,
        });
        res.status(200).json({
          user: {
            userId: user.userId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            addresses: user.addresses,
          },
          token: token,
        });
      });
    })
    .catch((err) => res.status(500).json({ message: LOGIN_FAILED }));
};

exports.login = async (req, res, next) => {
  const email = req.body.email;
  const admins = await getAdminFromDb();
  if (admins.some((admin) => admin.email === email)) {
    adminLogin(req, res, next);
  } else {
    this.userLogin(req, res, next);
  }
};

exports.getUser = (req, res, next) => {
  const userId = req.userId;
  getUserFromDb({ userId }, USER_PROPERTIES.join(" "))
    .then((user) => {
      if (!user) res.status(500).json({ message: USER_NOT_FOUND });
      res.status(200).json(user);
    })
    .catch(() => res.status(500).json({ message: CANNOT_GET_USER }));
};

exports.addItemToCart = async (req, res, next) => {
  const userId = req.userId;
  const productId = req.body.productId;
  const product = await getProductFromDb({ productId });
  const user = await getUserFromDb({ userId });
  const cartItemIndex = user.cartItems.findIndex(
    (cartItem) => cartItem.product && cartItem.product.productId === productId
  );
  if (cartItemIndex === -1) {
    user.cartItems.push({ product, quantity: 1 });
  } else {
    user.cartItems = user.cartItems.map((cartItem) => {
      if (cartItem.product && cartItem.product.productId === productId) {
        cartItem.quantity++;
      }
      return cartItem;
    });
  }
  updateUserInDb(user)
    .then((user) => res.status(200).json(user))
    .catch((err) => {
      res.status(500).json({ message: ITEM_NOT_ADDED_TO_CART });
    });
};

exports.removeItemFromCart = async (req, res, next) => {
  const userId = req.userId;
  const productId = req.body.productId;
  const user = await getUserFromDb({ userId });
  user.cartItems = user.cartItems.map((cartItem) => {
    if (cartItem.product.productId === productId) {
      cartItem.quantity--;
    }
    return cartItem;
  });
  user.cartItems = user.cartItems.filter((cartItem) => cartItem.quantity !== 0);
  updateUserInDb(user)
    .then((user) => res.status(200).json(user))
    .catch((err) => {
      res.status(500).json({ message: ITEM_NOT_REMOVED_FROM_CART });
    });
};

exports.getCartItems = (req, res, next) => {
  const userId = req.userId;
  getUserFromDb({ userId }, "cartItems")
    .then((user) => res.status(200).json(user.cartItems))
    .catch(res.status(500));
};

exports.getOderList = async (req, res, next) => {
  const userId = req.userId;
  const pageNumber = req.query ? +req.query.pageNumber : null;
  const limit = req.query ? +req.query.pageLimit : null;
  const skip = !!pageNumber && !!limit ? (pageNumber - 1) * limit : null;
  const totalCount = await countOrdersInDb({
    "customer.snapshot.userId": userId,
  });
  getOrderListFromDb({ "customer.snapshot.userId": userId }, null, skip, limit)
    .then((orders) => res.status(200).json({ orders, totalCount }))
    .catch((err) => res.status(500).json({ message: CANNOT_GET_ORDERS }));
};

const emptyCart = async (userId) => {
  const user = await getUserFromDb({ userId });
  user.cartItems = [];
  await updateUserInDb(user);
};

exports.checkout = async (req, res, next) => {
  try {
    const userId = req.userId;
    const address = req.body.address;
    let user;
    try {
      user = await getUserFromDb({ userId });
      if (!user) throw new Error(USER_NOT_FOUND);
    } catch {
      res.status(500).json({ message: USER_NOT_FOUND });
    }

    const products = user.cartItems.map((item) => {
      return {
        product: item.product,
        quantity: item.quantity,
        snapshot: {
          name: item.product.name,
          img: item.product.img,
          price: item.product.price,
          rating: item.product.rating,
          ratingProvider: item.product.ratingProvider,
          description: item.product.description,
          category: item.product.category,
          productId: item.product.productId,
        },
      };
    });

    const order = {
      orderId: generateRandomUniqueId(),
      orderedDateTime: Date.now(),
      customer: {
        customer: user,
        snapshot: {
          userId: user.userId,
          name: user.name,
          phone: user.phone,
          email: user.email,
          address,
        },
      },
      products,
      status: ORDER_STATES.REQUESTED,
      history: [
        {
          from: ORDER_STATES.CART,
          to: ORDER_STATES.REQUESTED,
          time: new Date(),
          Comment: "System",
        },
      ],
    };

    let recordedOrder;
    try {
      recordedOrder = await addOrderToDb(order);
    } catch {
      res.status(500).json({ message: ORDER_FAILED });
    }

    try {
      await emptyCart(userId);
    } catch {
      res.status(500).json({ message: CANNOT_UPDATE_USER });
    }
    require("../socket-io")
      .getIo()
      .emit("newOrderRequest", { order: recordedOrder });
    res.status(200).json(recordedOrder);
  } catch {
    res.status(500).json({ message: ORDER_FAILED });
  }
};

exports.addOrUpdateAddress = async (req, res, next) => {
  const userId = req.userId;
  const newAddress = req.body.address;
  let user;
  try {
    user = await getUserFromDb({ userId });
    if (!user) throw new Error("Cannot find user");
  } catch {
    res.status(500).json({ message: CANNOT_UPDATE_ADDRESS });
  }
  if (!!newAddress.addressId) {
    user.addresses = user.addresses.map((item) => {
      if (item.addressId === newAddress.addressId) {
        return newAddress;
      }
      return item;
    });
  } else {
    user.addresses.push({ ...newAddress, addressId: generateRandomUniqueId() });
  }
  updateUserInDb(user)
    .then(() => res.status(200).json(user.addresses))
    .catch((err) => {
      res.status(500).json({ message: CANNOT_UPDATE_ADDRESS });
    });
};

exports.deleteAddress = async (req, res, next) => {
  const userId = req.userId;
  const addressId = req.params.addressId;
  let user;
  try {
    user = await getUserFromDb({ userId });
    if (!user) throw new Error("Cannot find user");
  } catch {
    res.status(500).json({ message: CANNOT_DELETE_ADDRESS });
  }
  if (!!addressId) {
    user.addresses = user.addresses.filter(
      (item) => item.addressId !== addressId
    );
  } else {
    res.status(500).json({ message: CANNOT_DELETE_ADDRESS });
  }
  updateUserInDb(user)
    .then((user) => res.status(200).json(user.addresses))
    .catch(() => res.status(500).json({ message: CANNOT_DELETE_ADDRESS }));
};

exports.updateUserProfile = (req, res, next) => {
  const userId = req.userId;
  const updatedUserPatch = req.body.user;
  updateUserInDb({ userId, ...updatedUserPatch })
    .then((user) => res.status(200).json(user))
    .catch(() => res.status(500).json({ message: CANNOT_UPDATE_USER }));
};

exports.updatePassword = async (req, res, next) => {
  const userId = req.userId;
  const oldPassword = req.body.oldPassword;
  const newPassword = await bcrypt.hash(req.body.newPassword, 12);
  const user = await getUserFromDb({ userId });
  bcrypt
    .compare(oldPassword, user.password)
    .then((isEqual) => {
      if (isEqual) {
        user.password = newPassword;
        return updateUserInDb(user);
      } else throw new Error();
    })
    .then((user) => res.status(200).json(user))
    .catch((err) => {
      res.status(500).json({ message: CANNOT_UPDATE_PASSWORD });
    });
};

exports.sendResetPasswordLink = async (req, res, next) => {
  try {
    const email = req.body.email;
    const user = await getUserFromDb({ email });
    crypto.randomBytes(32, (err, buffer) => {
      if (err) throw new Error(err);
      const token = buffer.toString("hex");
      user.resetPasswordToken = token;
      user.resetPasswordExpirationDateTime = Date.now() + 5 * 60 * 1000;
      updateUserInDb(user)
        .then(() => {
          const resetPasswordLink = `${process.env.FRONT_END_BASE_LINK}/forgot-password/${token}`;
          const mailMessage = `Click <a href="${resetPasswordLink}">here</a> to reset e-restaurant password`;
          sendMail(user.email, "Reset Password", mailMessage);
          res.status(200).json();
        })
        .catch((err) => {
          throw new Error(err);
        });
    });
  } catch (err) {
    res.status(500).json({ message: CANNOT_SEND_MAIL });
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const resetPasswordToken = req.body.token;
    const password = req.body.password;
    const user = await getUserFromDb({ resetPasswordToken });
    if (!user || Date.now() > user.resetPasswordExpirationDateTime)
      throw new Error();
    const hashedPwd = await bcrypt.hash(password, 12);
    user.password = hashedPwd;
    user.resetPasswordToken = null;
    user.resetPasswordExpirationDateTime = null;
    updateUserInDb(user)
      .then(() => res.status(200).json())
      .catch((err) => {
        throw new Error(err);
      });
  } catch (err) {
    res.status(500).json({ message: CANNOT_UPDATE_PASSWORD });
  }
};
