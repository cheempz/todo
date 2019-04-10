FROM node:8-jessie

#
# options (it needs a service key)
# "docker build --build-arg TODO_SERVICE_KEY=service-key . -t todo"
# "docker run -e APPOPTICS_SERVICE_KEY todo cmd"
#
# you also might need to make sure it can connect to an existing mongodb
# server running in another docker setup. if so, this is helpful.
#
# $ docker network create mynet
#
# $ docker run --name foo --net mynet img
#
# $ docker run --name bar --net mynet img
#
# you don't really need to create a network though if it's already running.
# just "docker network ls", find the network that the mongodb is running in
# and "docker run -d --net mongodb-net todo"
#

ARG TODO_TARBALL
ENV TARBALL=${TODO_TARBALL:-https://api.github.com/repos/bmacnaughton/todomvc-mongodb/tarball}
# get the application, extract it, move it, and name the dir todo
RUN cd $HOME && \
    curl -LkSs $TARBALL -o todo.tar.gz && \
    mkdir -p tmp && tar -zvxf todo.tar.gz -C tmp && \
    mv tmp/$(ls -t tmp/ | head -1) $HOME/todo

RUN cd $HOME/todo && \
    npm install .


ARG TODO_MONGODB_ADDRESS=mongo_2_4:27017
ARG TODO_DEBUG=error,warn,patching,debug
ARG APPOPTICS_SERVICE_KEY
ARG APPOPTICS_COLLECTOR=collector-stg.appoptics.com
ARG APPOPTICS_REPORTER=ssl
ARG APPOPTICS_DEBUG_LEVEL
ARG TODO_SERVER_OPTIONS="--ws-ip=localhost:8088 -f express -l pino"

# persisted in the environment
ENV TODO_MONGODB_ADDRESS=$TODO_MONGODB_ADDRESS \
    APPOPTICS_SERVICE_KEY=$APPOPTICS_SERVICE_KEY \
    APPOPTICS_COLLECTOR=$APPOPTICS_COLLECTOR \
    APPOPTICS_REPORTER=$APPOPTICS_REPORTER \
    APPOPTICS_DEBUG_LEVEL=$APPOPTICS_DEBUG_LEVEL \
    APPOPTICS_LOG_SETTINGS=$TODO_LOG_LEVEL \
    TODO_SERVER_OPTIONS=$TODO_SERVER_OPTIONS

EXPOSE 8088

# set using --rate. server will override --rate with -r, if set in TODO_SERVER_OPTIONS
CMD ["/bin/bash", "-c", "env | grep APPOP && cd $HOME/todo && node server --db-ip=${TODO_MONGODB_ADDRESS} --rate 1000000 ${TODO_SERVER_OPTIONS}"]


