// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {FictionHallCryptoSplitCustom} from "../src/FictionHallCryptoSplitCustom.sol";

contract DeployFictionHallCryptoSplitCustom is Script {
    function run() external returns (FictionHallCryptoSplitCustom deployed) {
        address[3] memory tokens = [vm.envAddress("USDC_ADDRESS"), vm.envAddress("USDT_ADDRESS"), vm.envAddress("DAI_ADDRESS")];
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        deployed = new FictionHallCryptoSplitCustom(vm.envAddress("PLATFORM_TREASURY"), vm.envAddress("QUOTE_SIGNER"), tokens);
        vm.stopBroadcast();
    }
}
