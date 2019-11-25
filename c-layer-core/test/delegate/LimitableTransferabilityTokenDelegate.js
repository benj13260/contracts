"user strict";

/**
 * @author Cyril Lapinte - <cyril.lapinte@openfiz.com>
 */

const assertRevert = require("../helpers/assertRevert");
const TokenProxy = artifacts.require("TokenProxy.sol");
const TokenCore = artifacts.require("TokenCoreMock.sol");
const LimitableTransferabilityTokenDelegate = artifacts.require("LimitableTransferabilityTokenDelegate.sol");

const UserRegistryMock = artifacts.require("UserRegistryMock.sol");
const RatesProviderMock = artifacts.require("RatesProviderMock.sol");

const AMOUNT = 1000000;
const NAME = "Token";
const SYMBOL = "TKN";
const DECIMALS = 18;
const CHF = web3.utils.toHex("CHF").padEnd(66, "0");
const AUDIT_TRIGGERS_ONLY = 1;

contract("LimitableTransferabilityTokenDelegate", function (accounts) {
  let core, delegate, token, userRegistry, ratesProvider;

  beforeEach(async function () {
    delegate = await LimitableTransferabilityTokenDelegate.new();
    core = await TokenCore.new("Test");
    await core.defineTokenDelegate(0, delegate.address, [ 0 ]);
    await core.defineAuditConfiguration(0,
      AUDIT_TRIGGERS_ONLY, 0, true, // scopes
      [ false, true, false ], // datas
      [ false, false, false, false, true, true ] // fields
    );
  
    token = await TokenProxy.new(core.address);
    await core.defineToken(
      token.address, 0, NAME, SYMBOL, DECIMALS);
    await core.defineSupplyMock(token.address, AMOUNT);

    userRegistry = await UserRegistryMock.new(
      [accounts[0], accounts[1], accounts[2]], CHF, [5, 6666, 3333 ]);
    ratesProvider = await RatesProviderMock.new();
    await core.defineOracles(userRegistry.address, ratesProvider.address, [0, 1, 2]);
  });

  it("should transfer from accounts[0] to accounts[1]", async function () {
    const tx = await token.transfer(accounts[1], "1");
    assert.ok(tx.receipt.status, "Status");
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "Transfer", "event");
    assert.equal(tx.logs[0].args.from, accounts[0], "from");
    assert.equal(tx.logs[0].args.to, accounts[1], "to");
    assert.equal(tx.logs[0].args.value.toString(), "1", "value");

    const balance0 = await token.balanceOf(accounts[0]);
    assert.equal(balance0.toString(), "999999", "balance");
    const balance1 = await token.balanceOf(accounts[1]);
    assert.equal(balance1.toString(), "1", "balance");
  });

  it("should eval canTransfer Ok from accounts[0] to accounts[1]", async function () {
    const result = await token.canTransfer.call(accounts[0], accounts[1], "1");
    assert.equal(result, 1, "canTransfer");
  });

  it("should allow accounts[1] to receive too many tokens", async function () {
    const tx = await token.transfer(accounts[1], "3334");
    assert.ok(tx.receipt.status, "Status");
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "Transfer", "event");
    assert.equal(tx.logs[0].args.from, accounts[0], "from");
    assert.equal(tx.logs[0].args.to, accounts[1], "to");
    assert.equal(tx.logs[0].args.value.toString(), "3334", "value");
  });

  it("should eval canTransfer Ok from accounts[0] to accounts[1] with too many tokens", async function () {
    const result = await token.canTransfer.call(accounts[0], accounts[1], "3334");
    assert.equal(result, 1, "canTransfer");
  });

  it("should allow accounts[3] to receive some tokens", async function () {
    const tx = await token.transfer(accounts[3], "3333");
    assert.ok(tx.receipt.status, "Status");
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[0].event, "Transfer", "event");
    assert.equal(tx.logs[0].args.from, accounts[0], "from");
    assert.equal(tx.logs[0].args.to, accounts[3], "to");
    assert.equal(tx.logs[0].args.value.toString(), "3333", "value");
  });

  it("should eval canTransfer Ok from accounts[0] to accounts[3]", async function () {
    const result = await token.canTransfer.call(accounts[0], accounts[3], "3333");
    assert.equal(result, 1, "canTransfer");
  });

  describe("with trigger on sender", function () {
    beforeEach(async function () {
      await core.defineAuditTriggers(0, [ accounts[0] ], [ true ], [ false ], [ false ]);
    });

    it("should transfer 1 from accounts[0] to accounts[1]", async function () {
      const tx = await token.transfer(accounts[1], "1");
      assert.ok(tx.receipt.status, "Status");
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, "Transfer", "event");
      assert.equal(tx.logs[0].args.from, accounts[0], "from");
      assert.equal(tx.logs[0].args.to, accounts[1], "to");
      assert.equal(tx.logs[0].args.value.toString(), "1", "value");

      const balance0 = await token.balanceOf(accounts[0]);
      assert.equal(balance0.toString(), "999999", "balance");
      const balance1 = await token.balanceOf(accounts[1]);
      assert.equal(balance1.toString(), "1", "balance");
    });

    it("should eval canTransfer Ok 1 token from accounts[0] to accounts[1]", async function () {
      const result = await token.canTransfer.call(accounts[0], accounts[1], "1");
      assert.equal(result, 1, "canTransfer");
    });

    it("should transfer 2222 from accounts[0] to accounts[1]", async function () {
      const tx = await token.transfer(accounts[1], "2222");
      assert.ok(tx.receipt.status, "Status");
      assert.equal(tx.logs.length, 1);
      assert.equal(tx.logs[0].event, "Transfer", "event");
      assert.equal(tx.logs[0].args.from, accounts[0], "from");
      assert.equal(tx.logs[0].args.to, accounts[1], "to");
      assert.equal(tx.logs[0].args.value.toString(), "2222", "value");
    });

    it("should eval canTransfer Ok 2222 tokens from accounts[0] to accounts[1]", async function () {
      const result = await token.canTransfer.call(accounts[0], accounts[1], "2222");
      assert.equal(result, 1, "canTransfer");
    });

    describe("with many transfers", function () {
      beforeEach(async function () {
        await token.transfer(accounts[1], "1000");
        await token.transfer(accounts[1], "1222");
        await token.transfer(accounts[2], "1222");
      });

      it("should have a user audit for user 1", async function () {
        const audit1 = await core.auditUser(core.address, 0, 1);
        assert.equal(audit1[0], "0", "createdAt");
        assert.equal(audit1[1], "0", "lastTransactionAt");
        assert.equal(audit1[2], "0", "lastEmissionAt");
        assert.equal(audit1[3], "0", "lastReceptionAt");
        assert.equal(audit1[4].toString(), "5166", "cumulatedEmission");
        assert.equal(audit1[5].toString(), "0", "cumulatedReception");
      });

      it("should have a user audit for user 2", async function () {
        const audit1 = await core.auditUser(core.address, 0, 2);
        assert.equal(audit1[0], "0", "createdAt");
        assert.equal(audit1[1], "0", "lastTransactionAt");
        assert.equal(audit1[2], "0", "lastEmissionAt");
        assert.equal(audit1[3], "0", "lastReceptionAt");
        assert.equal(audit1[4].toString(), "0", "cumulatedEmission");
        assert.equal(audit1[5].toString(), "3333", "cumulatedReception");
      });

      it("should allow accounts[1] to transfer tokens from accounts 2", async function () {
        const tx = await token.transfer(accounts[1], "1000", { from: accounts[2] });
        assert.ok(tx.receipt.status, "Status");
        assert.equal(tx.logs.length, 1);
        assert.equal(tx.logs[0].event, "Transfer", "event");
        assert.equal(tx.logs[0].args.from, accounts[2], "from");
        assert.equal(tx.logs[0].args.to, accounts[1], "to");
        assert.equal(tx.logs[0].args.value.toString(), "1000", "value");
      });

      it("should eval canTransfer Ok from accounts[0] to accounts[2]", async function () {
        const result = await token.canTransfer.call(accounts[0], accounts[2], "1000");
        assert.equal(result, 1, "canTransfer");
      });

      it("should prevent accounts[1] to receive too many tokens from account 0", async function () {
        await assertRevert(token.transfer(accounts[1], "1"), "CO03");
      });

      it("should eval canTransfer not Ok from accounts[0] to accounts[1] with too many tokens", async function () {
        const result = await token.canTransfer.call(accounts[0], accounts[1], "3334");
        assert.equal(result, 8, "canTransfer");
      });

      it("should prevent accounts[1] to receive to few tokens", async function () {
        await assertRevert(token.transfer(accounts[1], "1"), "CO03");
      });

      it("should eval canTransfer not Ok from accounts[0] to accounts[1] with too few tokens", async function () {
        const result = await token.canTransfer.call(accounts[0], accounts[1], "1");
        assert.equal(result, 9, "canTransfer");
      });

      it("should prevent accounts[3] to receive any tokens", async function () {
        await assertRevert(token.transfer(accounts[3], "1"), "CO03");
      });

      it("should eval canTransfer not Ok from accounts[0] to accounts[3] with any tokens", async function () {
        const result = await token.canTransfer.call(accounts[0], accounts[3], "1");
        assert.equal(result, 9, "canTransfer");
      });
    });
  });
});
