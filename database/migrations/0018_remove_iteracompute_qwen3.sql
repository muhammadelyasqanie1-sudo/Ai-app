-- Remove IteraCompute's Qwen 3 catalogue entries permanently.
-- providerGateway also filters these IDs from future upstream catalogue refreshes.
DELETE FROM model_catalog
 WHERE provider_key = 'iteracompute'
   AND lower(model_key) LIKE 'qwen/qwen3%';
