import {
	accounts,
	assert,
} from '../common/common';
import ether from '../helpers/ether';
import expectEvent from '../helpers/expectEvent';
import EVMRevert from 'openzeppelin-solidity/test/helpers/EVMRevert';

const TokenErc721 = artifacts.require('ERC721TokenMock');
const MarketUniqxInstant = artifacts.require('MarketUniqxInstant');

contract('testing allow/disallow orders - ', function (rpc_accounts) {

	const ac = accounts(rpc_accounts);
	let token1Erc721, token2Erc721, market;
	let tokensCount = 10;
	let tokens1 = [];
	let tokens2 = [];
	let prices = [];

	it('should be able to deploy the smart contracts', async () => {

		market = await MarketUniqxInstant.new(
			ac.MARKET_ADMIN_MSIG,
			ac.MARKET_FEES_MSIG,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log("UNIQX successfully deployed at address " + market.address);
	});

	it('should be able to register an ERC721 contract', async () => {

		token1Erc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		token2Erc721 = await TokenErc721.new(
			ac.ADAPT_OWNER,
			ac.ADAPT_ADMIN,
			{ from: ac.OPERATOR }
		).should.be.fulfilled;

		console.log("ERC721 test contracts deployed at addresses " + token1Erc721.address + token2Erc721.address);


		let rec = await market.registerToken(
			token1Erc721.address,
			{ from: ac.MARKET_ADMIN_MSIG  }
		).should.be.fulfilled;


		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogRegisterToken', {
			erc721: token1Erc721.address
		});

		rec = await market.registerToken(
			token2Erc721.address,
			{ from: ac.MARKET_ADMIN_MSIG  }
		).should.be.fulfilled;

		rec.logs.length.should.be.equal(1);
		await expectEvent.inLog(rec.logs[0], 'LogRegisterToken', {
			erc721: token2Erc721.address
		});
	});

	it('should be able to mass mint new tokens', async() => {
		for (let i = 0; i < tokensCount; i++) {
			await token1Erc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}

		for (let i = 0; i < tokensCount; i++) {
			await token2Erc721.mint(ac.ADAPT_ADMIN, i, {
				from: ac.ADAPT_ADMIN
			}).should.be.fulfilled;
		}
	});

	it('should be able to enable the market to transfer tokens', async() => {
		for (let i = 0; i < tokensCount; i++) {
			tokens1[i] = await token1Erc721.tokenByIndex(i);
			tokens2[i] = await token2Erc721.tokenByIndex(i);
			console.log('token: ', tokens1[i].toString(10));
			prices[i] = ether(1);
		}

		// approve market to transfer all eerc721 tokens hold by admin
		await token1Erc721.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;

		await token2Erc721.setApprovalForAll(
			market.address,
			true,
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to make orders by default', async () => {
		await market.createMany(
			token1Erc721.address,
			[ tokens1[0], tokens1[1], tokens1[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		await market.createMany(
			token2Erc721.address,
			[ tokens2[0], tokens2[1], tokens2[2] ],
			[ ether(1), ether(1), ether(1) ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders per contract', async () => {
		const { logs } = await market.disableTokenOrders(
			token1Erc721.address,
			{ from: ac.MARKET_ADMIN_MSIG  }
		).should.be.fulfilled;

		logs.length.should.be.equal(1);
		await expectEvent.inLog(logs[0], 'LogDisableTokenOrders', {
			erc721: token1Erc721.address
		});
	});

	it('should not be able make orders for contract with orders disallowed', async () => {
		await market.createMany(
			token1Erc721.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able take/cancel orders for contract with orders disallowed', async () => {
		let listed = await market.tokenIsListed(token1Erc721.address, tokens1[0]);
		assert.equal(listed, true, 'Token should be listed');

		await market.buyMany(
			token1Erc721.address,
			[ tokens1[0] ],
			{ from: ac.BUYER2 , value: ether(1) }
		).should.be.fulfilled;

		listed = await market.tokenIsListed(token1Erc721.address, tokens1[0]);
		assert.equal(listed, false, 'Token should not be listed');

		await market.cancelMany(
			token1Erc721.address,
			[ tokens1[1] ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		listed = await market.tokenIsListed(token1Erc721.address, tokens1[1]);
		assert.equal(listed, false, 'Token should not be listed');
	});

	it('should be able make orders for other contracts with orders allowed', async () => {
		await market.createMany(
			token2Erc721.address,
			[ tokens2[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should not allow other than admin to disallow orders', async () => {
		await market.disableTokenOrders(
			token1Erc721.address,
			{ from: ac.BUYER1  }
		).should.be.rejectedWith(EVMRevert);

		await market.disableOrders(
			{ from: ac.BUYER1  }
		).should.be.rejectedWith(EVMRevert);
	});

	it('should be able to allow orders per contract', async () => {
		const { logs } = await market.enableTokenOrders(
			token1Erc721.address,
			{ from: ac.MARKET_ADMIN_MSIG  }
		).should.be.fulfilled;

		logs.length.should.be.equal(1);
		await expectEvent.inLog(logs[0], 'LogEnableTokenOrders', {
			erc721: token1Erc721.address
		});
	});

	it('should be able make orders for contract with allowed orders', async () => {
		await market.createMany(
			token1Erc721.address,
			[ tokens1[3] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.fulfilled;
	});

	it('should be able to disallow orders for all contacts', async () => {
		const { logs } = await market.disableOrders({from: ac.MARKET_ADMIN_MSIG}
		).should.be.fulfilled;

		logs.length.should.be.equal(1);
		await expectEvent.inLog(logs[0], 'LogDisableOrders', {});
	});

	it('should not be able make orders for any contracts when orders are disallowed globally', async () => {
		await market.createMany(
			token1Erc721.address,
			[ tokens1[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.rejectedWith(EVMRevert);

		await market.createMany(
			token2Erc721.address,
			[ tokens2[4] ],
			[ ether(1) ],
			{ from: ac.ADAPT_ADMIN }
		).should.be.rejectedWith(EVMRevert);

	});

	it('should be able take/cancel orders for contract when orders are disallowed globally', async () => {
		await market.buyMany(
			token1Erc721.address,
			[ tokens1[2] ],
			{ from: ac.BUYER2 , value: ether(1) }
		).should.be.fulfilled;

		await market.cancelMany(
			token1Erc721.address,
			[ tokens1[3] ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;

		await market.buyMany(
			token2Erc721.address,
			[ tokens2[2] ],
			{ from: ac.BUYER2 , value: ether(1) }
		).should.be.fulfilled;

		await market.cancelMany(
			token2Erc721.address,
			[ tokens2[3] ],
			{ from: ac.ADAPT_ADMIN  }
		).should.be.fulfilled;
	});
});
