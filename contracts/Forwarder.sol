// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract Forwarder is Ownable {  
  using ECDSA for bytes32;

  // whitelist mapping
  mapping(address => bool) public isWhitelisted;
  // signer whitelisting toggle
  bool public signerWhitelistEnabled;
  // relayer whitelisting toggle
  bool public relayerWhitelistEnabled;
  // nonce mapping for replay protection
  mapping(address => mapping(uint256 => bool)) public nonces;
    
  receive() external payable { }
  
  // batch forward requests
  function forwardBatch(address[] memory _to, bytes[] calldata _data, bytes[] memory _signature, address rewardToken, uint256[] memory fee, uint256[] memory nonce, address[] memory signer) public returns (bytes[] memory _results) {
      require(_to.length <= 50, "EXCEED_BATCH_LIMIT");
      _results = new bytes[](_to.length);
      for (uint i = 0; i < _to.length; i++) {
          (bytes memory result) = forward(_to[i], _data[i], _signature[i], rewardToken, fee[i], nonce[i], signer[i]);
          _results[i] = result;
      }
  }
  
  // verify the data and execute the data at the target address
  function forward(address _to, bytes calldata _data, bytes memory _signature, address rewardToken, uint256 fee, uint256 nonce, address signer) public returns (bytes memory _result) {
    bool success;
    require(verifySignature(_to, _data, _signature, nonce, signer), "INVALID_SIGNATURE");

    (success, _result) = _to.call(_data);
    require(success, "FAILED_EXTERNAL_CALL");

    if (fee > 0) { // pay fee to sender/relayer if provided
      if (rewardToken == address(0)) {
        (bool sent, ) = msg.sender.call{value: fee, gas: 36000}(""); // eth fee
        require(sent);
      } else {
        require((StandardToken(rewardToken)).transfer(msg.sender, fee)); // native token fee
      }
    }
}
  
  // verify signature & that sender is whitelisted (if necessary)
  function verifySignature(address _to, bytes calldata _data, bytes memory signature, uint256 nonce, address signer) private returns (bool) {
    require(_to != address(0), "INVALID_TARGET");
    
    bytes memory payload = abi.encode(_to, _data);
    address signerAddress = keccak256(payload).toEthSignedMessageHash().recover(signature);
    require(signerAddress == signer, "INVALID_SIGNER");

    if (signerWhitelistEnabled) require(isWhitelisted[signerAddress], "SIGNER_NOT_AUTHORIZED");
    if (relayerWhitelistEnabled) require(isWhitelisted[msg.sender], "RELAYER_NOT_AUTHORIZED");
    require(nonces[signerAddress][nonce] == false, "NONCE_ALREADY_EXECUTED");

    nonces[signerAddress][nonce] = true;
    return nonces[signerAddress][nonce];
  }
  
  // whitelist a signer or relayer
  function addToWhitelist(address addy) external onlyOwner {
    isWhitelisted[addy] = true;
  }

  // toggle relayer whitelist check
  function toggleRelayerWhitelist() external onlyOwner {
    relayerWhitelistEnabled = !relayerWhitelistEnabled;
  }

  // toggle signer whitelist check
  function toggleSignerWhitelist() external onlyOwner {
    signerWhitelistEnabled = !signerWhitelistEnabled;
  }
}

contract StandardToken {
  function transfer(address _to,uint256 _value) public returns (bool) { }
}
