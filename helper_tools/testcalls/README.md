# Testcalls

Helper app for adding lots of tests to the worker.

## Setup

- ```mkdir data``` 
- Add ```testcalls-template.json``` to the data dir
    - This is a standard json object as required in the ```frontend``` service 
- Add ```urls-to-use.json``` to the data dir
    - This is a json array of objects
    - E.g:
        - ```json
            [{"referenceUrl": "https://www.google.com", "url": "https://www.google.hu"}] 
            ```
- ```cp config.dist.js config.js```         

## testcalls

Command: ```node testcalls```
Alternatively: ```./testcalls.js```

It'll send the tests to the worker and create a ```test-uuid-list.json``` file.

## testresults

Command: ```node testresults.js```
Alternatively: ```./testresults.js```

This will read ```test-uuid-list.json``` and outputs the results to files:
- `results.data.json`: Every data sent by the worker
- `results.urls.md`: Only the result urls as a md
    - This is generated because PHPStorm has a .md plugin which makes it easy to open all these urls quickly in this format
