var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var dotenv = require('dotenv');
var resolve = require('path').resolve;
var getDb = require('../lib/db').getDb;
var _a = require('mongodb'), WithId = _a.WithId, Document = _a.Document;
// Load environment variables from .env.local
var envPath = resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });
function createCustomers() {
    return __awaiter(this, void 0, void 0, function () {
        var db, transactions, customerMap_1, i, _i, _a, _b, customerKey, data, customers, _loop_1, _c, _d, _e, customerKey, data, result, error_1;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _f.trys.push([0, 5, , 6]);
                    console.log('Connecting to MongoDB...');
                    return [4 /*yield*/, getDb()
                        // Get all transactions with customer information
                    ];
                case 1:
                    db = _f.sent();
                    return [4 /*yield*/, db.collection('transactions')
                            .find({
                            customer: { $exists: true, $ne: '' },
                            type: 'sale',
                            status: { $ne: 'void' }
                        })
                            .sort({ date: 1 })
                            .toArray()];
                case 2:
                    transactions = _f.sent();
                    console.log("Found ".concat(transactions.length, " transactions with customer information"));
                    // Log any transactions with unusual customer data
                    transactions.forEach(function (transaction) {
                        if (!transaction.customer || transaction.customer.trim() === '') {
                            console.log('Transaction with empty customer name:', {
                                id: transaction._id,
                                date: transaction.date,
                                source: transaction.source,
                                amount: transaction.amount
                            });
                        }
                    });
                    customerMap_1 = new Map();
                    transactions.forEach(function (transaction) {
                        var customerKey = transaction.source === 'square'
                            ? "square_".concat(transaction.customer)
                            : transaction.customer.toLowerCase();
                        if (!customerMap_1.has(customerKey)) {
                            customerMap_1.set(customerKey, {
                                transactions: [],
                                sources: new Set(),
                                sourceIds: new Map()
                            });
                        }
                        var customerData = customerMap_1.get(customerKey);
                        customerData.transactions.push(transaction);
                        customerData.sources.add(transaction.source);
                        if (transaction.source === 'square' && transaction.customer) {
                            customerData.sourceIds.set('square', transaction.customer);
                        }
                    });
                    console.log("Found ".concat(customerMap_1.size, " unique customers"));
                    // Log customer names before creating documents
                    console.log('\nCustomer name samples:');
                    i = 0;
                    for (_i = 0, _a = Array.from(customerMap_1.entries()); _i < _a.length; _i++) {
                        _b = _a[_i], customerKey = _b[0], data = _b[1];
                        if (i++ < 5) { // Show first 5 examples
                            console.log("- Source: ".concat(Array.from(data.sources)[0], ", Key: ").concat(customerKey, ", First transaction customer name: ").concat(data.transactions[0].customer));
                        }
                    }
                    customers = [];
                    _loop_1 = function (customerKey, data) {
                        var transactions_1 = data.transactions;
                        var sources = Array.from(data.sources).map(function (source) {
                            var _a;
                            return ({
                                source: source,
                                sourceId: data.sourceIds.get(source),
                                name: source === 'square' && data.sourceIds.get('square')
                                    ? customerKey.replace('square_', '')
                                    : ((_a = transactions_1[0].customer) === null || _a === void 0 ? void 0 : _a.trim()) || undefined
                            });
                        });
                        var totalSpent = transactions_1.reduce(function (sum, t) { return sum + (t.amount || 0); }, 0);
                        // Try to get the best possible name
                        var customerName = 'Unknown';
                        // First try to get a name from sources
                        var sourceWithName = sources.find(function (s) { return s.name && s.name.trim() !== ''; });
                        if (sourceWithName === null || sourceWithName === void 0 ? void 0 : sourceWithName.name) {
                            customerName = sourceWithName.name;
                        }
                        else {
                            // If no source has a name, try to find a valid name from transactions
                            var transactionWithName = transactions_1.find(function (t) { return t.customer && t.customer.trim() !== ''; });
                            if (transactionWithName === null || transactionWithName === void 0 ? void 0 : transactionWithName.customer) {
                                customerName = transactionWithName.customer.trim();
                            }
                        }
                        var customer = {
                            name: customerName,
                            sources: sources,
                            firstPurchaseDate: transactions_1[0].date,
                            lastPurchaseDate: transactions_1[transactions_1.length - 1].date,
                            totalSpent: totalSpent,
                            totalOrders: transactions_1.length,
                            averageOrderValue: totalSpent / transactions_1.length,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };
                        // Log if we couldn't find a proper name
                        if (customerName === 'Unknown') {
                            console.log('Customer with no valid name found:', {
                                customerKey: customerKey,
                                sources: Array.from(data.sources),
                                transactionCount: transactions_1.length,
                                firstTransactionDate: transactions_1[0].date
                            });
                        }
                        customers.push(customer);
                    };
                    for (_c = 0, _d = Array.from(customerMap_1.entries()); _c < _d.length; _c++) {
                        _e = _d[_c], customerKey = _e[0], data = _e[1];
                        _loop_1(customerKey, data);
                    }
                    // Create customers collection and insert documents
                    console.log('Creating customers collection...');
                    return [4 /*yield*/, db.createCollection('customers')];
                case 3:
                    _f.sent();
                    console.log('Inserting customer documents...');
                    return [4 /*yield*/, db.collection('customers').insertMany(customers)];
                case 4:
                    result = _f.sent();
                    console.log("Successfully created ".concat(result.insertedCount, " customer documents"));
                    process.exit(0);
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _f.sent();
                    console.error('Error creating customers:', error_1);
                    process.exit(1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
createCustomers();
