import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// const methodology = {
//   Volume:
//     "Trading volume from Futarchy AMM spot swaps measured in USDC based on direction of swap.",
//   Revenue: "0.25% fee charged on all swaps (applied to USDC value).",
// };

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();

  const query = `
    WITH futswap AS (
        SELECT
            block_time,
            tx_signer,
            tx_id,
            data,
            CASE
                WHEN to_hex(SUBSTR(data, 105, 1)) = '00' THEN 'buy'
                WHEN to_hex(SUBSTR(data, 105, 1)) = '01' THEN 'sell'
            END AS swap_type,
            from_big_endian_64(reverse(SUBSTR(data, 106, 8))) / 1e6 AS input_amount,
            from_big_endian_64(reverse(SUBSTR(data, 114, 8))) / 1e6 AS output_amount,
            CASE
                WHEN LENGTH(data) = 406 THEN to_base58(SUBSTR(data, 279, 32))
                WHEN LENGTH(data) = 670 THEN to_base58(SUBSTR(data, 543, 32))
            END AS token
        FROM solana.instruction_calls
        WHERE executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
        AND inner_executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
        AND account_arguments[1] = 'DGEympSS4qLvdr9r3uGHTfACdN8snShk4iGdJtZPxuBC'
        AND cardinality(account_arguments) = 1
        AND is_inner = true
        AND tx_success = true
        AND CAST(data AS VARCHAR) LIKE '0xe445a52e51cb9a1d%'
        AND LENGTH(data) >= 300
        AND array_join(log_messages, ' ') LIKE '%SpotSwap%'
    )
    SELECT
        date_trunc('day', block_time) AS day,
        SUM(
            CASE
                WHEN swap_type = 'buy' THEN input_amount
                WHEN swap_type = 'sell' THEN output_amount
            END
        ) AS volume,
        COUNT(*) AS swaps,
        SUM(
            CASE
                WHEN swap_type = 'buy' THEN input_amount
                WHEN swap_type = 'sell' THEN output_amount
            END
        ) * 0.0025 AS rev
    FROM futswap
    WHERE swap_type IN ('buy', 'sell')
    GROUP BY 1
    ORDER BY 1;
  `;

  const result = await queryDuneSql(options, query);

  if (result && result[0]) {
    const volume = result[0].volume || 0;
    const rev = result[0].rev || 0;

    dailyVolume.addToken(
      "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      volume
    );
    dailyRevenue.addToken(
      "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      rev
    );
  }

  return {
    dailyVolume,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 1728432060, // October 9, 2024 00:01 UTC
    },
  },
};

export default adapter;
