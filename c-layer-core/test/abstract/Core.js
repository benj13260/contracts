"user strict";

/**
 * @author Cyril Lapinte - <cyril.lapinte@openfiz.com>
 */

const assertRevert = require("../helpers/assertRevert");
const DelegateMock = artifacts.require("DelegateMock.sol");
const CoreMock = artifacts.require("CoreMock.sol");

const NULL_ADDRESS = "0x".padEnd(42, "0");
const BYTES = web3.utils.toHex("TheAnswerToLife").padEnd(66, "0");

contract("Core", function (accounts) {
  let core, proxy, delegate;

  beforeEach(async function () {
    proxy = accounts[0];
    delegate = await DelegateMock.new();
    core = await CoreMock.new();
  });

  it("should define a delegate", async function () {
    const tx = await core.defineDelegateMock(1, delegate.address);
    assert.ok(tx.receipt.status, "Status");
  });

  describe("With a delegate defined", async function () {
    beforeEach(async function () {
       await core.defineDelegateMock(1, delegate.address);
    });

    it("should un-define a delegate", async function () {
      const tx = await core.defineDelegateMock(1, NULL_ADDRESS);
      assert.ok(tx.receipt.status, "Status");
    });

    it("should define a proxy", async function () {
      const tx = await core.defineProxyMock(proxy, 1);
      assert.ok(tx.receipt.status, "Status");
    });

    it("should prevent defining a null proxy", async function () {
      await assertRevert(core.defineProxyMock(NULL_ADDRESS, 1), "CO04");
    });

    it("should prevent define a proxy with a non existant delegate", async function () {
      await assertRevert(core.defineProxyMock(proxy, 2), "CO02");
    });

    describe("With a proxy defined", async function () {
      beforeEach(async function () {
        await core.defineProxyMock(proxy, 1);
      });

      it("should let the proxy to success only proxy", async function () {
        const success = await core.successOnlyProxy(true);
        assert.ok(success, "success");
      });

      it("should prevent non proxy to success only proxy", async function () {
        await assertRevert(core.successOnlyProxy(true, { from: accounts[1] }), "CO01");
      });

      it("should delegate call bool", async function () {
        const success = await core.delegateCallMock.call(true);
        assert.ok(success, "success");
      });

      it("should delegate call uint256", async function () {
        const result = await core.delegateCallUint256Mock.call(42);
        assert.equal(result, "42", "result");
      });

      it("should delegate call bool", async function () {
        const bytes = await core.delegateCallBytesMock.call(BYTES);
        assert.equal(bytes.length, 194, "bytes length");
        assert.ok(bytes.indexOf(BYTES.substr(2)) !== -1, "bytes ends");
      });

      it("should let the core remove the proxy", async function () {
        const success = await core.removeProxyMock(proxy);
        assert.ok(success, "success");
      });
    });
  });
});
