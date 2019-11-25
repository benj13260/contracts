"user strict";

/**
 * @author Cyril Lapinte - <cyril.lapinte@openfiz.com>
 */

const TokenProxy = artifacts.require("TokenProxy.sol");
const TokenCore = artifacts.require("TokenCore.sol");
const MintableTokenDelegate = artifacts.require("MintableTokenDelegate.sol");
const TokenDelegate = artifacts.require("TokenDelegate.sol");

const UserRegistryMock = artifacts.require("UserRegistryMock.sol");
const RatesProviderMock = artifacts.require("RatesProviderMock.sol");

const NAME = "Token";
const SYMBOL = "TKN";
const DECIMALS = 18;
const TOTAL_SUPPLY = "1000000";
const CHF = web3.utils.toHex("CHF").padEnd(66, "0");

const CORE_GAS_COST = 4553937;
const MINTABLE_DELEGATE_GAS_COST = 1624965;
const DELEGATE_GAS_COST = 3962747;
const PROXY_GAS_COST = 906251;

const MINTABLE_FIRST_TRANSFER_COST = 60358;
const MINTABLE_FIRST_TRANSFER_FROM_COST = 68028;
const MINTABLE_TRANSFER_COST = 44877;
const FIRST_TRANSFER_COST = 65846;
const FIRST_TRANSFER_FROM_COST = 73471;
const TRANSFER_COST = 50366;
const AUDITED_FIRST_TRANSFER_COST = 164958;
const AUDITED_FIRST_TRANSFER_FROM_COST = 173400;
const AUDITED_TRANSFER_COST = 103038;
const AUDIT_MODE_TRIGGERS_ONLY = 1;
const AUDIT_MODE_ALWAYS = 3;

contract("Performance", function (accounts) {
  let userRegistry, ratesProvider;
  let core;

  before(async function () {
    userRegistry = await UserRegistryMock.new(
      [accounts[0], accounts[1], accounts[2]], CHF, [5, 5000000, 5000000 ]);
    ratesProvider = await RatesProviderMock.new();
  });

  it("should have a core gas cost at " + CORE_GAS_COST, async function () {
    const gas = await TokenCore.new.estimateGas("Test");
    assert.equal(gas, CORE_GAS_COST, "gas");
  });

  it("should have a mintable delegate gas cost at " + MINTABLE_DELEGATE_GAS_COST, async function () {
    const gas = await MintableTokenDelegate.new.estimateGas();
    assert.equal(gas, MINTABLE_DELEGATE_GAS_COST, "gas");
  });

  it("should have a mintable C delegate gas cost at " + DELEGATE_GAS_COST, async function () {
    const gas = await TokenDelegate.new.estimateGas();
    assert.equal(gas, DELEGATE_GAS_COST, "gas");
  });

  it("should have a proxy gas cost at " + PROXY_GAS_COST, async function () {
    core = await TokenCore.new("Test");
    const gas = await TokenProxy.new.estimateGas(core.address);
    assert.equal(gas, PROXY_GAS_COST, "gas");
  });

  describe("With delegates defined", function () {
    let delegates, token;

    beforeEach(async function () {
      delegates = await Promise.all([
        MintableTokenDelegate.new(), TokenDelegate.new(),
      ]);
      core = await TokenCore.new("Test");

      await core.defineTokenDelegate(0, delegates[0].address, []);
      await core.defineTokenDelegate(1, delegates[1].address, []);
      await core.defineOracles(userRegistry.address, ratesProvider.address, [ 0, 1, 2 ]);
    });

    describe("With a mintable token defined", function () {
      beforeEach(async function () {
        token = await TokenProxy.new(core.address);
        await core.defineToken(
          token.address, 0, NAME, SYMBOL, DECIMALS);
        await core.mint(token.address, accounts[0], TOTAL_SUPPLY);
        await token.transfer(token.address, "3333");
        await token.approve(accounts[1], "3333");
      });

      it("shuld estimate a first transfer accounts[0]", async function () {
        const gas = await token.transfer.estimateGas(accounts[1], "3333");
        assert.equal(gas, MINTABLE_FIRST_TRANSFER_COST, "estimate");
      });

      it("should estimate a first transfer from accounts[0]", async function () {
        const gas = await token.transferFrom.estimateGas(accounts[0], accounts[2], "3333", { from: accounts[1] });
        assert.equal(gas, MINTABLE_FIRST_TRANSFER_FROM_COST, "estimate");
      });

      // Later transfer does not have to allocate extra memory and should be cheaper
      it("should estimate more transfer from accounts[0]", async function () {
        await token.transfer(accounts[1], "3333");
        const gas = await token.transfer.estimateGas(accounts[1], "3333");
        assert.equal(gas, MINTABLE_TRANSFER_COST, "estimate");
      });
    });

    describe("With a c token defined", function () {
      beforeEach(async function () {
        token = await TokenProxy.new(core.address);
        await core.defineToken(
          token.address, 1, NAME, SYMBOL, DECIMALS);
        await core.mint(token.address, accounts[0], TOTAL_SUPPLY);
        await token.transfer(token.address, "3333"); // force global variables init
        await token.approve(accounts[1], "3333");
      });

      it("should eval canTransfer Ok", async function () {
        const result = await token.canTransfer.call(accounts[0], accounts[1], 0);
        assert.equal(result, 1, "canTransfer");
      });

      it("should estimate a first transfer accounts[0]", async function () {
        const gas = await token.transfer.estimateGas(accounts[1], "3333");
        assert.equal(gas, FIRST_TRANSFER_COST, "estimate");
      });

      it("should estimate a first transfer from accounts[0]", async function () {
        const gas = await token.transferFrom.estimateGas(accounts[0], accounts[2], "3333", { from: accounts[1] });
        assert.equal(gas, FIRST_TRANSFER_FROM_COST, "estimate");
      });

      // Later transfer does not have to allocate extra memory and should be cheaper
      it("should estimate more transfer from accounts[0]", async function () {
        await token.transfer(accounts[1], "3333");
        const gas = await token.transfer.estimateGas(accounts[1], "3333");
        assert.equal(gas, TRANSFER_COST, "estimate");
      });

      describe("With audit configuration", function () {
        beforeEach(async function () {
          await core.defineTokenDelegate(1, delegates[1].address, [ 0, 1 ]);
          await core.defineAuditConfiguration(
            0, AUDIT_MODE_TRIGGERS_ONLY, 0, true,
            [ false, true, false ],
            [ false, false, false, false, false, true ]);
          await core.defineAuditTriggers(
            0, [ accounts[0] ], [ true ], [ false ], [ false ]);
          await core.defineAuditConfiguration(
            1, AUDIT_MODE_ALWAYS, 0, false,
            [ false, false, true ],
            [ false, true, false, false, false, false ]);
        });

        it("should estimate a first transfer accounts[0]", async function () {
          const gas = await token.transfer.estimateGas(accounts[1], "3333");
          assert.equal(gas, AUDITED_FIRST_TRANSFER_COST, "estimate");
        });

        it("should estimate a first transfer from accounts[0]", async function () {
          const gas = await token.transferFrom.estimateGas(accounts[0], accounts[2], "3333", { from: accounts[1] });
          assert.equal(gas, AUDITED_FIRST_TRANSFER_FROM_COST, "estimate");
        });

        // Later transfer does not have to allocate extra memory and should be cheaper
        it("should estimate more transfer from accounts[0]", async function () {
          await token.transfer(accounts[1], "3333");
          const gas = await token.transfer.estimateGas(accounts[1], "3333");
          assert.equal(gas, AUDITED_TRANSFER_COST, "estimate");
        });
      });
    });
  });
});
