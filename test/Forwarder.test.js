const { expect, use } = require('chai');
const { BigNumber, Contract, utils } = require( 'ethers');
const { deployContract, MockProvider, solidity } = require('ethereum-waffle');

use(solidity);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('Forwarder', () => {
  const [wallet, walletTo] = new MockProvider().getWallets();
  let tokenContract;
  let proxyContract;
  let owner;

  beforeEach(async () => {
    const token = await ethers.getContractFactory("ERC20Token");
    const proxy = await ethers.getContractFactory("Forwarder");
    tokenContract = await token.deploy(); // deploy token contract to test forwarding
    await tokenContract.deployed();
    proxyContract = await proxy.deploy();
    await proxyContract.deployed();
    [owner] = await ethers.getSigners();

    await tokenContract.transfer(proxyContract.address, 1000000); // populate proxy with ERC20 for test metatransfers
    await owner.sendTransaction({to: proxyContract.address, value: utils.parseEther("5.0")}) // populate proxy with ETH for test metatranfers
  });

  it('Asserts successful forward request of metatransfer, no whitelisting enabled', async () => {
    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '100', '1', wallet.address);
    expect(await tokenContract.balanceOf(walletTo.address)).to.equal(5000); // assert on metatransfer
    expect(await tokenContract.balanceOf(owner.address)).to.equal(9999000100); // asert on fee to tx relayer; init supply (10000000000) minus proxy transfer (1000000)
                                                                                // plus 100 for the fee
  });

  it('Asserts successful forward request of metatransfer with ETH fee, no whitelisting enabled', async () => {
    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await proxyContract.forward(tokenContract.address, data, signature, ZERO_ADDRESS, utils.parseEther("0.01"), '1', wallet.address);
    expect(await tokenContract.balanceOf(walletTo.address)).to.equal(5000); // assert on metatransfer
    expect(await (new MockProvider().getBalance(wallet.address))).to.equal(BigNumber.from("10000000000000000000000000000000000")); // ETH fee credited to relayer
  });

  it('Asserts failed forward request of metatransfer, no whitelisting enabled, insufficient balance to pay fee (PORT)', async () => {
    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await expect(proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '1000005', '1', wallet.address))
      .to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'ERC20: transfer amount exceeds balance'");
  });

  it('Asserts failed forward request of metatransfer, no whitelisting enabled, insufficient balance to pay fee (ETH)', async () => {
    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await expect(proxyContract.forward(tokenContract.address, data, signature, ZERO_ADDRESS, utils.parseEther("10.0"), '1', wallet.address))
      .to.be.revertedWith(""); // doesn't return reason string, simply reverts
  });

  it('Asserts successful forwardBatch request of metatransfer, no whitelisting enabled', async () => {
    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await proxyContract.forwardBatch(
      [tokenContract.address, tokenContract.address], 
      [data, data], 
      [signature, signature], 
      tokenContract.address, 
      ['100', '100'], 
      ['1', '2'], 
      [wallet.address, wallet.address]);
    expect(await tokenContract.balanceOf(walletTo.address)).to.equal(10000);
  });

  it('Asserts failed forward request of metatransfer due to nonce collision', async () => {
    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '100', '1', wallet.address);

    await expect(proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '100', '1', wallet.address))
      .to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'NONCE_ALREADY_EXECUTED'");
  });

  it('Asserts relayerWhitelist toggle', async () => {
    expect(await proxyContract.relayerWhitelistEnabled()).to.equal(false);
    await proxyContract.toggleRelayerWhitelist();
    expect(await proxyContract.relayerWhitelistEnabled()).to.equal(true);
    await proxyContract.toggleRelayerWhitelist();
    expect(await proxyContract.relayerWhitelistEnabled()).to.equal(false); // return to false
  });

  it('Asserts signerWhitelist toggle', async () => {
    expect(await proxyContract.signerWhitelistEnabled()).to.equal(false);
    await proxyContract.toggleSignerWhitelist();
    expect(await proxyContract.signerWhitelistEnabled()).to.equal(true);
    await proxyContract.toggleSignerWhitelist();
    expect(await proxyContract.signerWhitelistEnabled()).to.equal(false); // return to false
  });

  it('Asserts successful whitelisting', async () => {
    expect(await proxyContract.isWhitelisted(walletTo.address)).to.equal(false);
    await proxyContract.addToWhitelist(walletTo.address); // whitelist signer
    expect(await proxyContract.isWhitelisted(walletTo.address)).to.equal(true);
  });

  it('Asserts rejected forward request of metatransfer due to unwhitelisted signer', async () => {
    await proxyContract.toggleSignerWhitelist(); // require signers to be whitelisted

    const { data, signature } = await constructMetaTransfer(walletTo.address, '10', tokenContract.address, wallet);
  
    await expect(proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '0', '1', wallet.address))
      .to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'SIGNER_NOT_AUTHORIZED'");

    await proxyContract.toggleSignerWhitelist(); // reset signer whitelist toggle
  });

  it('Asserts rejected forward request of metatransfer due to unwhitelisted relayer', async () => {
    await proxyContract.toggleRelayerWhitelist(); // require signers to be whitelisted

    const { data, signature } = await constructMetaTransfer(walletTo.address, '10', tokenContract.address, wallet);
  
    await expect(proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '0', '1', wallet.address))
      .to.be.revertedWith("VM Exception while processing transaction: reverted with reason string 'RELAYER_NOT_AUTHORIZED'");

    await proxyContract.toggleRelayerWhitelist(); // reset relayer whitelist toggle
  });

  it('Asserts successful forward request of metatransfer with whitelisted signer', async () => {
    await proxyContract.toggleSignerWhitelist(); // require signers to be whitelisted
    await proxyContract.addToWhitelist(wallet.address); // whitelist signer

    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '0', '2', wallet.address);
    expect(await tokenContract.balanceOf(walletTo.address)).to.equal(5000);

    await proxyContract.toggleSignerWhitelist(); // reset signer whitelist toggle
  });

  it('Asserts successful forward request of metatransfer with whitelisted relayer', async () => {
    await proxyContract.toggleRelayerWhitelist(); // require signers to be whitelisted
    await proxyContract.addToWhitelist(owner.address); // whitelist owner/relayer

    const { data, signature } = await constructMetaTransfer(walletTo.address, '5000', tokenContract.address, wallet);
  
    await proxyContract.forward(tokenContract.address, data, signature, tokenContract.address, '0', '3', wallet.address);
    expect(await tokenContract.balanceOf(walletTo.address)).to.equal(5000);

    await proxyContract.toggleRelayerWhitelist(); // reset relayer whitelist toggle
  });
});

const constructMetaTransfer = async (to, amount, recipientContract, signer) => { 
  const iface = new utils.Interface(['function transfer(address,uint256)'])
  const data = iface.encodeFunctionData('transfer', [to, amount])

  const hash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
    ['address','bytes'],
    [recipientContract,data]
    )
  )

  const signature = await signer.signMessage(utils.arrayify(hash));
  return { data, signature };
}