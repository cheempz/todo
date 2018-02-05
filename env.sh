ARG=$1

if [[ -z "$AO_TOKEN_STG" ]]; then
    echo "AO_TOKEN_STG must be defined and contain a valid token"
    echo "for accessing collector-stg.appoptics.com"
    return
fi

# define this for all consitions
export APPOPTICS_SERVICE_KEY=${AO_TOKEN_STG}:node-todo-test

if [[ -z "$ARG" ]]; then
    echo "source this script with an argument of stg or prod. it"
    echo "will define environment variables to enable testing with"
    echo "the specified collector".
    echo
    echo "you may also use the argument debug to define additional"
    echo "debugging variables"
    echo
elif [[ "$ARG" = "stg" ]]; then
    echo "setting stg environment variables"
    export APPOPTICS_REPORTER=ssl
    export APPOPTICS_COLLECTOR=collector-stg.appoptics.com
elif [[ "$ARG" = "prod" ]]; then
    echo "ERROR: prod is not yet implemented"
elif [[ "$ARG" = "debug" ]]; then
    echo "setting debug environment variables"
    #export APPOPTICS_DEBUG_LEVEL=6
    #export APPOPTICS_SHOW_GYP=1

    # show output of the spawned 'npm install' process
    #export AO_TEST_BINDINGS_OUTPUT=1
    # see dist/debug-loggers.js for DEBUG options
    #export DEBUG
else
    echo "ERROR $ARG invalid"
fi

return
