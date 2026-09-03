// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {FictionHallCryptoSplitV1} from "../src/FictionHallCryptoSplitV1.sol";

contract DeployFictionHallCryptoSplitV1 is Script {
    function run() external returns (FictionHallCryptoSplitV1 deployed) {
        address[3] memory tokens = [vm.envAddress("USDC_ADDRESS"), vm.envAddress("USDT_ADDRESS"), vm.envAddress("DAI_ADDRESS")];
        address[3] memory feeds = [vm.envAddress("USDC_USD_FEED"), vm.envAddress("USDT_USD_FEED"), vm.envAddress("DAI_USD_FEED")];
        uint16[8] memory platformBps = [
            uint16(vm.envUint("SPLIT_A_PLATFORM_BPS")), uint16(vm.envUint("SPLIT_B_PLATFORM_BPS")),
            uint16(vm.envUint("SPLIT_C_PLATFORM_BPS")), uint16(vm.envUint("SPLIT_D_PLATFORM_BPS")),
            uint16(vm.envUint("SPLIT_E_PLATFORM_BPS")), uint16(vm.envUint("SPLIT_F_PLATFORM_BPS")),
            uint16(vm.envUint("SPLIT_G_PLATFORM_BPS")), uint16(vm.envUint("SPLIT_H_PLATFORM_BPS"))
        ];
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        deployed = new FictionHallCryptoSplitV1(vm.envAddress("PLATFORM_TREASURY"), vm.envAddress("QUOTE_SIGNER"), uint48(vm.envUint("MAX_ORACLE_AGE")), tokens, feeds, platformBps);
        vm.stopBroadcast();
    }
}
